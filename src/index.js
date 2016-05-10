#!/usr/bin/env node --harmony

var Hipchatter = require('hipchatter');
var yaml = require('write-yaml');
var program = require('commander');

var url = require('url');
var posixpath = require('path').posix;

var package_json = require('../package')


var _parseInt = function(string, defaultValue) {
  var int = parseInt(string, 10);

  if (typeof int == 'number') {
    if (int > 0 && int <= 4) {
      return int;
    }
    else {
      throw "int(" + string + ") does not fall within the specified range: [1-4]";
    }
  } else {
    return defaultValue;
  }
}

/**
* Usage.
*/
program
  .version(package_json.version)
  .description(package_json.description)
  .option('-d, --debug', 'Run in debug mode')
  .option('-t, --token [token]', 'Set HIPCHAT_API_TOKEN (token must have View Group permissions)')
  .option('-I, --no-import', 'Fetch emoticons from hipchat, but do not import into Slack')
  .option('-G, --no-global', 'Filter out global emoticons')
  .option('-s, --scale <n>', 'Explicitly retrieve emoticons at the specified scale', _parseInt, 1)
  .parse(process.argv);


var hipchatToken = program.token || process.env.HIPCHAT_API_TOKEN;
if (hipchatToken === void 0) {
  console.error(
    "You must supply a Hipchat APIv2 token by commandline:\n" +
    "     ex: node src/index.js --token <token>\n" +
    " or in the environment\n" +
    "   *nix: HIPCHAT_API_TOKEN=<token> node src/index.js\n" +
    "    win: cmd /V /C \"set \"HIPCHAT_API_TOKEN=<token>\" && node .\\src\\index.js\"");
  process.exit(1);
}
else {
  console.log("HIPCHAT_API_TOKEN=%s", hipchatToken);
}


var hipchatter = new Hipchatter(hipchatToken);

// Load the emoticons from hipchat
hipchatter.emoticons({ 'start-index': 0, 'max-results': 1000 }, function(err, emoticons){
  if (err) {
    console.error("hipchatter.emoticons: %s", err);
  }
  else {
    console.log(emoticons);

    // Grab only the parts we need and format them in a way that we can quickly
    // output to a yaml file for consumption

    var pack = {
      title: 'emoticons',
      emojis: []
    };

    pack.emojis = emoticons.reduce(function(result, emoticon) {
      if (emoticon.type === "global" && ! program.global) {
        console.log("Skipping global emoticon: %s", emoticon.shortcut);
        return result;
      }

      emoticon_url = emoticon.url;
      if (program.scale > 1) {
        urlobj = url.parse(emoticon_url);
        pathname = urlobj.pathname;
        dirname = posixpath.dirname(pathname);
        ext = posixpath.extname(pathname);
        basename = posixpath.basename(pathname);

        // see scaled emoticon url format in hipchat documentation
        urlobj.pathname = posixpath.join(dirname, basename + "@" + program.scale + "x" + ext);

        emoticon_url = url.format(urlobj);
      }

      result.push({
        name: emoticon.shortcut,
        src: emoticon_url
      });

      return result;
    }, pack.emojis);

    console.log(JSON.stringify(pack, null, 2));

    yaml('emoticons.yml', pack, function(err) {
      if (err) {
        console.log(err);
        return 1;
      }

      if (! program.import) {
        console.log("skipping import by user request. exiting...");
        return 0;
      }

      // Blatantly copied from the emojipacks bin
      var Prompt = require('../node_modules/emojipacks/lib/prompt');
      var Slack = require('../node_modules/emojipacks/lib/slack');
      var Pack = require('../node_modules/emojipacks/lib/pack');
      var co = require('co');

      /**
      * Start process.
      */
      co(function *() {
        var user = yield Prompt.start();
        var pack = yield Pack.get(user.pack);
        user.emojis = pack.emojis;
        var slack = new Slack(user, program.debug);
        yield slack.import();
        process.exit();
      });
    });
  }
});
