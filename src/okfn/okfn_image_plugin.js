goog.provide('annotorious.okfn.ImagePlugin');

goog.require('goog.array');
goog.require('goog.soy');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.dom.query');
goog.require('goog.events');
goog.require('goog.math');
goog.require('goog.style');

/**
 * Implementation of the Yuma image plugin for OKFN Annotator.
 * @param {element} image the image to be annotated
 * @param {Object} okfnAnnotator reference to the OKFN Annotator instance
 * @constructor
 */
annotorious.okfn.ImagePlugin = function(image, okfnAnnotator) {
  var baseOffset = annotorious.dom.getOffset(okfnAnnotator.element[0].firstChild);
    
  var eventBroker = new annotorious.events.EventBroker();
  
  var annotationLayer = goog.dom.createDom('div', 'yuma-annotationlayer');
  goog.style.setStyle(annotationLayer, 'position', 'relative');
  goog.style.setSize(annotationLayer, image.width, image.height); 
  goog.dom.replaceNode(annotationLayer, image);
  goog.dom.appendChild(annotationLayer, image);
    
  var hint = goog.soy.renderAsElement(annotorious.templates.image.hint, {msg:'Click and Drag to Annotate'});
  goog.style.setOpacity(hint, 0); 
  goog.dom.appendChild(annotationLayer, hint);
  
  var viewCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas,
    { width:image.width, height:image.height });
  goog.dom.appendChild(annotationLayer, viewCanvas);   


  var popup = new annotorious.okfn.Popup(image, eventBroker, okfnAnnotator, baseOffset);

  var viewer = new annotorious.modules.image.Viewer(viewCanvas, popup, eventBroker);
  
  var editCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas, 
    { width:image.width, height:image.height });
  goog.style.showElement(editCanvas, false); 
  goog.dom.appendChild(annotationLayer, editCanvas);  

  var selector = new annotorious.selection.DragSelector(editCanvas, eventBroker);
 
  /** Checks if the mouseover/out event happened inside the annotatable area. **/
  /** Annotator makes this task a little complex...                           **/
  var isMouseEventInside = function(event) {
    var relatedTarget = event.relatedTarget;
    
    // No related target - mouse was inside the annotationLayer on page load
    if (!relatedTarget)
      return true;  

    // Related target is a child of the annotation layer - inside
    if (goog.dom.contains(annotationLayer, relatedTarget))
      return true;

    // Related target is part of the Annotator editor - inside
    if (goog.dom.contains(okfnAnnotator.editor.element[0], relatedTarget))
      return true;

    // Related target is part of the Annotator popup - inside
    if (goog.dom.contains(okfnAnnotator.viewer.element[0], relatedTarget))
      return true;

    return false;
  }
 
  var self = this;  
  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOVER, function(event) {
    if (!isMouseEventInside(event))
      eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_MEDIA);
  });
  
  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOUT, function(event) {
    if (!isMouseEventInside(event))
      eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_MEDIA);
  });

  popup.addMouseOverHandler(function(event) {
    if (!isMouseEventInside(event))
      eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_MEDIA);
  });

  popup.addMouseOutHandler(function(event) { 
    if (!isMouseEventInside(event))
      eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_MEDIA);
  });
 
  goog.events.listen(viewCanvas, goog.events.EventType.MOUSEDOWN, function(event) {
    goog.style.showElement(editCanvas, true);
    selector.startSelection(event.offsetX, event.offsetY);
  });
  
  eventBroker.addHandler(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_MEDIA, function() {
    goog.style.setOpacity(viewCanvas, 1.0); 
    goog.style.setOpacity(hint, 0.8); 
  });
  
  eventBroker.addHandler(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_MEDIA, function() {
    goog.style.setOpacity(viewCanvas, 0.4); 
    goog.style.setOpacity(hint, 0);
  });

  /** Communication yuma -> okfn **/
  
  eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, function(event) {    
    var annotation = { url: image.src, shape: event.shape };
    okfnAnnotator.publish('beforeAnnotationCreated', annotation);
	
    var imgOffset = annotorious.dom.getOffset(image);
    var geometry = event.shape.geometry; 
    var x = geometry.x + imgOffset.left - baseOffset.left + 16;
    var y = geometry.y + geometry.height + imgOffset.top + window.pageYOffset - baseOffset.top + 5;
    
    okfnAnnotator.showEditor(annotation, {top: window.pageYOffset - baseOffset.top, left: 0});
    goog.style.setPosition(okfnAnnotator.editor.element[0], x, y);	
  });
  
  /** Communication okfn -> yuma **/
  
  okfnAnnotator.viewer.on('edit', function(annotation) {
    if (annotation.url == image.src) {
      eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_MEDIA);
      goog.dom.classes.add(okfnAnnotator.viewer.element[0], 'annotator-hide');
      goog.style.setStyle(viewCanvas, 'pointer-events', 'none');
      viewer.highlightAnnotation(undefined);

      // TODO code duplication -> move into a function
      var imgOffset = annotorious.dom.getOffset(image);
      var geometry = annotation.shape.geometry;
      var x = geometry.x + imgOffset.left - baseOffset.left + 16;
      var y = geometry.y + geometry.height + imgOffset.top - baseOffset.top + window.pageYOffset + 5;

      // Use editor.show instead of showEditor to prevent a second annotationEditorShown event
      goog.style.setPosition(okfnAnnotator.editor.element[0], 0, window.pageYOffset - baseOffset.top);
      okfnAnnotator.editor.show();
      goog.style.setPosition(okfnAnnotator.editor.element[0], x, y);
    }
  });

  okfnAnnotator.subscribe('annotationCreated', function(annotation) {
    if (annotation.url == image.src) {
      selector.stopSelection();
      if(annotation.url == image.src) {
	viewer.addAnnotation(annotation);
      }
    }
  });
  
  okfnAnnotator.subscribe('annotationsLoaded', function(annotations) {
    goog.array.forEach(annotations, function(annotation) {
      if(annotation.url == image.src) {
	viewer.addAnnotation(annotation);
      }
    });
  });
  
  okfnAnnotator.subscribe('annotationDeleted', function(annotation) {
    if(annotation.url == image.src) {
      viewer.removeAnnotation(annotation);
    }
  });
  
  okfnAnnotator.subscribe('annotationEditorHidden', function(editor) {
    goog.style.showElement(editCanvas, false);
    goog.style.setStyle(viewCanvas, 'pointer-events', 'auto');
    selector.stopSelection();
  });
}

/**
 * OKFN plugin interface.
 */
window['Annotator']['Plugin']['AnnotoriousImagePlugin'] = (function() {
  function AnnotoriousImagePlugin(element, options) {
    this._el = element;
  }

  AnnotoriousImagePlugin.prototype['pluginInit'] = function() {
    var images = this._el.getElementsByTagName('img');
    
    var self = this;
    annotorious.dom.addOnLoadHandler(function() {
      goog.array.forEach(images, function(img, idx, array) {
        new annotorious.okfn.ImagePlugin(img, self['annotator']);
      });
    });
  }
  
  return AnnotoriousImagePlugin;
})();

