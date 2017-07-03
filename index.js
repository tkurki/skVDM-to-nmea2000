/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require("debug")("signalk:skVDM-to-nmea2000");
const _ = require("lodash");
const Dissolve = require("dissolve");
const Concentrate = require("concentrate");

module.exports = function(app) {
  var plugin = {};
  var unsubscribe = undefined;

  plugin.start = function(props) {
    debug("starting with " + props);

    app.signalk.on('delta', function(delta) {
      if (delta.updates) {
        delta.updates.forEach(function(update) {
          if (update.source && update.source.sentence === 'VDM') {
            var mapping = {
              'navigation.speedOverGround': [{
                from: 'value',
                to: 'sog'
              }],
              'navigation.courseOverGroundTrue': [{
                from: 'value',
                to: 'cog'
              }],
              'navigation.position': [{
                from: 'value.latitude',
                to: 'latitude'
              }, {
                from: 'value.longitude',
                to: 'longitude'
              }]
            }
            var holder = {};
            if (update.values) {
              update.values.forEach(function(pathValue) {
                if (mapping[pathValue.path]) {
                  mapping[pathValue.path].forEach(function(fromTo) {
                    try {
                      holder[fromTo.to] = _.get(pathValue, fromTo.from);
                    } catch (e) {
                      console.error(e)
                    }
                  })
                  delete mapping[pathValue.path];
                }
              });
              try {
                if (Object.getOwnPropertyNames(mapping).length === 0) {
                  var data = Concentrate()
                    .buffer(template_129039.messageIdAndRepeatIndicator)
                    .uint32(delta.context.split(':')[4])
                    .int32((holder.longitude * 10000000).toFixed(0))
                    .int32((holder.latitude * 10000000).toFixed(0))
                    .buffer(template_129039.accuracyRaimTimestamp)
                    .uint16((holder.cog * 10000).toFixed(0))
                    .uint16((holder.sog * 100).toFixed(0))
                    .buffer(template_129039.comms)
                    .uint16(template_129039.heading)
                    .buffer(template_129039.regApp)
                    .buffer(template_129039.misc)
                    .result();
                  var result = toActisenseSerialFormat(129039, data);
                  debug(result);
                  app.emit('nmea2000out', result);
                }
              } catch (ex) {
                console.log(ex.stack)
              }
            }
          }
        });
      }
    });


    debug("started");
  };

  plugin.stop = function() {
    debug("stopping");
    if (unsubscribe) {
      unsubscribe();
    }
    debug("stopped");
  };

  plugin.id = "skVDM-to-nmea2000";
  plugin.name = "Signal K (VDM) to NMEA 2000";
  plugin.description =
    "Plugin that converts Signal K data originating in NMEA0183 VDM sentences to NMEA2000";

  plugin.schema = {
    type: "object",
    properties: {}
  };

  return plugin;
};

const parser_129039 = Dissolve().loop(function(end) {
  this.buffer("messageIdAndRepeatIndicator", 1);
  this.uint32("mmsi");
  this.uint32("longitude");
  this.uint32("latitude");
  this.buffer("accuracyRaimTimestamp", 1);
  this.uint16("cog");
  this.uint16("sog");
  this.buffer("comms", 3);
  this.uint16("heading");
  this.buffer("regApp", 1);
  this.buffer("misc", 2);

  this.push(this.vars);
});

function parseHex(s) {
  return parseInt(s, 16);
}

//timestamp,prio,pgn,src,dest,len[,data]+`

const string_129039 =
  "2014-08-15T19:00:00.363,4,129039,43,255,26,12,44,11,b6,0d,32,83,be,0e,5b,4f,99,23,03,ac,87,3e,01,06,00,26,ff,ff,00,74,ff";
const sampleData_129039 = new Buffer(
  string_129039.split(",").slice(6).map(parseHex),
  "hex"
);

let template_129039 = undefined;
parser_129039.on("readable", function() {
  var e;
  while ((e = parser_129039.read())) {
    if (e.messageIdAndRepeatIndicator) {
      template_129039 = e;
    }
  }
});
parser_129039.write(sampleData_129039);

var toActisenseSerialFormat = function(pgn, data) {
  return (
    "2014-08-15T19:00:00.363,4," +
    pgn +
    ",43,255,26," +
    new Uint32Array(data)
      .reduce(function(acc, i) {
        acc.push(i.toString(16));
        return acc;
      }, [])
      .map(x => (x.length === 1 ? "0" + x : x))
      .join(",")
  );
};
