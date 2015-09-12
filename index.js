
var util = require('util');
var url =  require('url');
var http = require("http");
var fs = require("fs");
var parseString = require('xml2js').parseString;

var conf = {realtime: false};


if(process.argv.length < 3) {
  console.log("Usage: index.js <MPD_URL>");
  process.exit();
}

function parse_url_base(uri) {
  var parsed = url.parse(uri);
  var out = parsed.protocol+"//"+parsed.host+parsed.pathname;


  out = out.slice(0,out.lastIndexOf("/")+1);
  return out;
}

var input_uri = process.argv[2];
var input_base =  parse_url_base(input_uri);
var input_dash_base = "";

var Audio = null;
var Video = null;
var STORAGE = "temp/";

http_get(input_uri);

function http_get(addr) {
  http.get(addr, function (res) {
    var mpd_data = "";
    console.log("Got response: " + res.statusCode);

    //Handle redirection
    if(res.statusCode == 301 || res.statusCode == 302) {
      console.log("Redir: "+res.headers["location"]);
      http_get(res.headers["location"]);
      return;
    }

    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      mpd_data += chunk;
    });
    res.on('end', function() {
      xml_parse(mpd_data);
    });

  }).on('error', function (e) {
    console.log("Got error: " + e.message);
  });
}

// Select the representation with highest bitrate
function select_representation(Media) {
  var best_bandwidth = 0;
  for (var key in Media['Representation']) {
    var value = Media['Representation'][key];
    var bandwidth = value['$']['bandwidth'];

    if(bandwidth > best_bandwidth) {
      best_bandwidth = bandwidth;
      Media['selected_representation'] = value;
    }
  }
}

// HTTP get a segment
function fetch_next_segment(Media, init) {

  var segment_file = init ? Media['init'] : Media['media'];

  segment_file = segment_file.replace("$RepresentationID$", Media['selected_representation']['$']['id']);
  if (!init) segment_file = segment_file.replace("$Time$",
    parseInt(Media['segment_start']) + parseInt(Media['segment_duration']) * Media['segment_current']);

  // Move to the next segment
  if (!init) {
    Media['segment_current']++;
  }
  console.log("Fetching "+input_base+input_dash_base + segment_file)
  http.get(input_base+input_dash_base + segment_file, function (res) {
    res.pipe(fs.createWriteStream(STORAGE + segment_file));
    if (res.statusCode == 200) {
      res.on('end', function () {
        //fetch_next_segment(Media, false);
      });
    } else {
      console.log("Got status code " + res.statusCode + " Stopping..");
    }
  });
}

function xml_parse(data) {
  parseString(data, function (err, result) {
    if(err) {
      console.log("Invalid MPD data");
      process.exit();
    }
    //console.log(util.inspect(result, false, null));
    //try {
      var Period = result['MPD']['Period'];
      input_dash_base = Period[0]['BaseURL'][0];
      var adaptationSets = Period[0]['AdaptationSet'];

      var processing = null;
      for (var key in adaptationSets) {
        var value = adaptationSets[key];
        processing = value['$']['contentType'];

        if(processing == "video") {
          Video = value;
        }
        if(processing == "audio") {
          Audio = value;
        }
      }

      if(Audio) {
        Audio['init'] = Audio['SegmentTemplate'][0]['$']['initialization'];
        Audio['media'] = Audio['SegmentTemplate'][0]['$']['media'];
        Audio['start'] = Audio['SegmentTemplate'][0]['$']['startNumber'];
        Audio['segment_current'] = 0;
        Audio['segment_start'] = Audio['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['t'];
        Audio['segment_count'] = Audio['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['r'];
        Audio['segment_duration'] = Audio['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['d'];
      }

      if(Video) {
        Video['init'] = Video['SegmentTemplate'][0]['$']['initialization'];
        Video['media'] = Video['SegmentTemplate'][0]['$']['media'];
        Video['start'] = Video['SegmentTemplate'][0]['$']['startNumber'];
        Video['segment_current'] = 0;
        Video['segment_start'] = Video['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['t'];
        Video['segment_count'] = Video['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['r'];
        Video['segment_duration'] = Video['SegmentTemplate'][0]['SegmentTimeline'][0]['S'][0]['$']['d'];
      }
      select_representation(Video);
      select_representation(Audio);

      fetch_next_segment(Video, true);
      fetch_next_segment(Audio, true);


    /*}      catch(e) {
      console.log("Invalid MPD data while parsing");
      process.exit();
    } */
    //console.dir(result);
  });
}
