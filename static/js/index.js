$(document).ready(function() {
  $.get('/api/list', function(data) {
    if (data.payload.ids.length > 0) {
      // Create table for the list.
      var table = $("<table>");
      table.addClass('table');
      data.payload.ids.forEach(function(id) {
        table.append("<tr><td><a href=\"/editor/" + id + "\">" + id + "</a></td></tr>");
      });
      $("#exist-note-container").append(table);
    }
  }, 'json');
});
