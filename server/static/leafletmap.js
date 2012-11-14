var Hashing = (function() {
  var _map;
  var _hashing_on = false;

  var DEFAULT_LAT = 70.0, DEFAULT_LNG = 0;

  function getHashByMap(map) {
    var zoom = map.getZoom(),
      center = map.getCenter(),
      lat = center.lat,
      lng = center.lng;
    return getHash(zoom, lat, lng);
  }

  function getHash(zoom, lat, lng) {
    var precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
    return '#' + zoom.toFixed(2) + '/' +
           lat.toFixed(precision) + '/' + lng.toFixed(precision);
  }

  function setHash(zoom, lat, lng) {
    location.hash = getHash(zoom, lat, lng);
  }

  return {
     showPermalink: function() {
       if ($('#permalink:visible').size()) {
         $('#permalink a.close-permalink').click();
         return;
       }
       var container = $('#permalink');
       $('input[name="permalink"]', container)
         .val(location.href + getHashByMap(_map));
       container.slideDown(300);
       $('input[name="permalink"]', container)
         .show().focus().select();
     },
     setup: function(map, default_zoom) {
       _map = map;
       var hash = location.hash.substring(1);
       var args = hash.split("/").map(Number);
       if (args.length < 3 || args.some(isNaN)) {
         args = null;
       }
       if (args) {
         _hashing_on = true;
         map.setView([args[1], args[2]], args[0]);
       } else {
         // Default!
         map.setView([DEFAULT_LAT, DEFAULT_LNG], default_zoom);
       }

       // set up the event
       map.on('move', function(event) {
         if (!_hashing_on) return;
         var c = event.target.getCenter();
         setHash(event.target.getZoom(), c.lat, c.lng);
       });

       $('#permalink a.close-permalink').on('click', function() {
         $('#permalink').slideUp(100);
         return false;
       });

     }
  };
})();


var Annotations = (function() {
  var annotations = {};
  return {
     new_annotation: function(annotation) {
       annotations[annotation.options.id] = annotation;
     },
     edit: function(id) {
       Drawing.edit_annotation(annotations[id]);
       return false;
     },
     delete_: function(id) {
       Drawing.delete_annotation(annotations[id]);
       delete annotations[id];
       return false;
     },
     init: function(map) {
       $.getJSON(location.pathname + '/annotations', function(response) {
         $.each(response.annotations, function(i, each) {
           var options = {draggable: each.yours, title: each.title, id: each.id};
           options.weight = each.yours && 4 || 2;
           var annotation;
           if (each.type == 'circle') {
             annotation = L[each.type](each.latlngs[0], each.radius, options);
           } else if (each.type == 'marker') {
             options.icon = MARKER_ICON;
             annotation = L[each.type](each.latlngs[0], options);
           } else {
             annotation = L[each.type](each.latlngs, options);
           }
           annotation
             .addTo(map)
               .bindPopup(each.html);

           Annotations.new_annotation(annotation);

           if (each.yours && each.type == 'marker') {
             // means you can edit it
             annotation.on('dragend', function(event) {
               var data = {
                  id: event.target.options.id,
                 lat: event.target.getLatLng().lat,
                 lng: event.target.getLatLng().lng
               };
               $.post(location.pathname + '/annotations/move', data, function() {
                 Title.change_temporarily("Marker moved", 2, true);
               });
             });
           }
         });
       });
     }
  };
})();


var Title = (function() {
  var current_title;
  var timer;
  var locked = false;

  return {
     change_temporarily: function (msg, msec, animate) {
       if (locked) {
         clearTimeout(timer);
       }
       current_title = document.title;
       msec = typeof(msec) !== 'undefined' ? msec : 2500;
       if (msec < 100) msec *= 1000;
       if (timer) {
         clearTimeout(timer);
       }
       document.title = msg;
       locked = true;
       timer = setTimeout(function() {
         if (animate) {
           var interval = setInterval(function() {
             document.title = document.title.substring(1, document.title.length);
             if (!document.title.length) {
               clearInterval(interval);
               locked = false;
               document.title = current_title;
             }
           }, 40);
         } else {
           document.title = current_title;
           locked = false;
         }
       }, msec);
     }
  }
})();


var TrackKeeper = (function() {
  var urls = [];
  var new_urls = [];
  var total_bytes = 0;
  var locked = false;
  var extension = null;

  function path(url) {
    return url.match(/\d\/\d+,\d+/g)[0];
  }

  function humanize_size(filesize) {
    var kilo = 1024;
    var units = ['bytes', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb'];
    if (filesize < kilo) { return filesize.toFixed() + ' ' + units[0]; }
    var thresholds = [1];
    for (var i = 1; i < units.length; i++) {
      thresholds[i] = thresholds[i-1] * kilo;
      if (filesize < thresholds[i]) {
        return (filesize / thresholds[i-1]).toFixed(1) + ' ' + units[i-1];
      }
    }
  }

  function update_new_urls() {
    var url = location.pathname + '/weight';
    var data = {urls: new_urls.join('|'), extension: extension};
    $.post(url, data, function(response) {
      total_bytes += response.bytes;
      $('#track-stats').show();
      $('#track-stats span').text(humanize_size(total_bytes));
    });
    new_urls = [];
  }

  return {
     notice: function(url) {
       var p = path(url);
       if (!extension) {
         extension = url.match(/\.[a-z]+$/g)[0];
       }
       if ($.inArray(p, urls) === -1) {
         urls.push(p);
         new_urls.push(p);
         if (!locked) {
           locked = true;
           setTimeout(function() {
             update_new_urls();
             locked = false;
           }, 2 * 1000);
         }
       }
     }
  };
})();


var MARKER_ICON = L.icon({
  iconUrl: MARKER_ICON_URL,
  shadowUrl: MARKER_SHADOW_URL,
  iconSize: new L.Point(25, 41),
  iconAnchor: new L.Point(13, 41),
  popupAnchor: new L.Point(1, -34),
  shadowSize: new L.Point(41, 41)
});

// when we can't rely on using MARKER_ICON (such as in draw)
// we have to set a default
L.Icon.Default.imagePath = '/static/libs/images';



var CustomButtons = (function() {

  function launchFullScreen(element) {
    if(element.requestFullScreen) {
      element.requestFullScreen();
    } else if(element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if(element.webkitRequestFullScreen) {
      element.webkitRequestFullScreen();
    }
  }

  function cancelFullscreen() {
    if(document.cancelFullScreen) {
      document.cancelFullScreen();
    } else if(document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if(document.webkitCancelFullScreen) {
      document.webkitCancelFullScreen();
    }
  }

  function make_button(container, classname, title, href, handler, visible) {
    var link = L.DomUtil.create('a', classname, container);
    link.href = href;
    link.title = title;
    if (!visible) {
      link.style['display'] = 'none';
    }

    L.DomEvent
      .on(link, 'click', L.DomEvent.stopPropagation)
        .on(link, 'mousedown', L.DomEvent.stopPropagation)
          .on(link, 'dblclick', L.DomEvent.stopPropagation)
            .on(link, 'click', L.DomEvent.preventDefault)
              .on(link, 'click', handler);
    return link;
  }

  var custom_button_class = L.Control.extend({
     options: {
        position: 'topright'
     },
    initialize: function (options) {
        L.Util.extend(this.options, options);
    },

    onAdd: function(map) {
      this._map = map;
      var container = L.DomUtil.create('div', 'leaflet-control-custom');

      var home_link = L.DomUtil.create('a', 'leaflet-control-custom-home', container);
      home_link.href = '/';
      home_link.title = "Go back to the Home page";

      make_button(container,
                  'leaflet-control-custom-permalink',
                  "Permanent link to this view",
                  '#',
                  this.handle_permalink,
                  true);

      make_button(container,
                  'leaflet-control-custom-fullscreen',
                  "Fullscreen",
                  '#',
                  this.handle_fullscreen,
                 true);

      make_button(container,
                  'leaflet-control-custom-unfullscreen',
                  "Exit fullscreen",
                  '#',
                  this.handle_unfullscreen,
                  false);

      make_button(container,
                  'leaflet-control-custom-edit',
                  "Edit information about picture",
                  '#',
                  this.handle_edit,
                  false);

      return container;
    },
    handle_fullscreen: function() {
      $('a.leaflet-control-custom-fullscreen').hide();
      $('a.leaflet-control-custom-unfullscreen').show();
      launchFullScreen(document.documentElement);
      return false;
    },
    handle_unfullscreen: function() {
      cancelFullscreen();
      $('a.leaflet-control-custom-unfullscreen').hide();
      $('a.leaflet-control-custom-fullscreen').show();
      return false;
    },
    handle_permalink: function() {
      Hashing.showPermalink();
      return false;
    },
    handle_edit: function() {
      Editing.open();
      return false;
    }
  });

  return {
     setup: function(map) {
       var buttons = new custom_button_class();
       buttons.addTo(map);
     }
  };
})();


$(function() {

  var $body = $('body');
  var image = $body.data('image');
  var range_min = $body.data('range-min');
  var range_max = $body.data('range-max');
  var default_zoom = $body.data('default-zoom');
  var extension = $body.data('extension');
  var prefix = $body.data('prefix');


  var tiles_url = prefix + '/tiles/' + image + '/256/{z}/{x},{y}.' + extension;
  var map_layer = new L.TileLayer(tiles_url, {
      minZoom: range_min,
      maxZoom: range_max,
      zoomControl: range_max > range_min
    });
  map_layer.on('tileload', function(e) {
    TrackKeeper.notice(e.url);
  });

  var map = new L.Map('map', {
     layers: [map_layer],
  });

  map
    .attributionControl
    .setPrefix('Powered by <a href="http://hugepic.io/">HUGEpic.io</a>');
  CustomButtons.setup(map);
  Hashing.setup(map, default_zoom);
  Annotations.init(map);

  setTimeout(function() {
    $.post(location.pathname + '/hit', {'_xsrf': $('input[name="_xsrf"]').val()});
  }, 1000);

  if (typeof map_loaded_callback !== 'undefined') {
    map_loaded_callback(map);
  }
});
