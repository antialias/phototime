var express = require("express");
var iniparser = require('iniparser');
var config = iniparser.parseSync('./config.ini');
var OAuth = require('oauth').OAuth;
var redis = require("redis");
var rc = redis.createClient();
var Sequence = require("futures").sequence;
var keygrip = require("keygrip");
var http = require('http');
var Cookies = require("cookies");
var keygrip = require("keygrip")(["abc123","123abc"]);
var ExifImage = require('exif').ExifImage;

app = express();
app.configure(function() {
	app.use(Cookies.express(keygrip));
	app.use(function (req,res,next) {
		var user,user_json = req.cookies.get("user");
		if (undefined === user_json) {
			user = {};
		} else {
			user = JSON.parse(user_json);
		}
		req.user = function(key) {
			if (!user.hasOwnProperty(key)) return undefined;
			return user[key];
		};
		res.user = function(key, val) {
			user[key] = val;
			return res;
		};
		res.user.setCookie = function() {
			if (!req.user("session_id")) {
				res.user("session_id", Math.floor(Math.random() * (Math.pow(2,32) - 1)));
			}
			res.cookies.set("user", JSON.stringify(user), {signed:true});
		}
		next();
	});
	app.set('port', process.env.PORT || 3001);
});

oa = new OAuth(
	"http://openapi.etsy.com/v2/oauth/request_token?scope=listings_w",
	"http://openapi.etsy.com/v2/oauth/access_token",
	config.etsy.keystring,
	config.etsy.sharedsecret,
	"1.0",
	null, // set in the request
	"HMAC-SHA1"
);
app.get("*", function (req,res,next) {
	if (req.path === "/etsy_authorize_callback") { next(); }
	else if (req.user('oauth_access_token')) { next() ; }
	else {
		oa._authorize_callback = "http://" + req.headers.host + "/etsy_authorize_callback";
		oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
			res.user(
				"oauth_token_secret",
				oauth_token_secret
			);
			res.user(
				"oauth_token",
				oauth_token
			);
			res.user(
				"oauth_consumer_key",
				results.oauth_consumer_key
			);
			res.user.setCookie();
			res.redirect(results.login_url);
		});
	};
});
app.get('/etsy_authorize_callback', function(req,res) {
	res.user("oauth_token", req.query["oauth_token"]);
	res.user("oauth_verifier", req.query["oauth_verifier"]);
	oa.getOAuthAccessToken(req.query["oauth_token"], req.user("oauth_token_secret"), req.query["oauth_verifier"], function(err, oauth_access_token, oauth_access_token_secret, results ) {
		res.user("oauth_access_token", oauth_access_token);
		res.user("oauth_access_token_secret", oauth_access_token_secret);
		res.user.setCookie();
		res.redirect("/");
	});
});
function bookmarklet() {
	try {document.location.hostname.match(/^(www.)etsy.com$/) && window.open("http://localhost:3001/phototime/" + document.location.pathname.match(/^\/listing\/([\d]+).*/)[1])} catch(e) {};
}
app.get('/', function(req,res) {
	res.user.setCookie();
	res.send("<a href = 'javascript:" + encodeURIComponent("(" + bookmarklet.toString() + ")()") + "' >drag to bookmarks bar</a>");
});
app.get("/phototime/:listing_id", function(req,res) {
	res.user.setCookie(); // to get session id
	var key, val;
	rc.lpush(
		key = "user_" + req.user("session_id"),
		val = "listing:" + req.params.listing_id + ":" + (new Date).getTime(),
		function (err) {
			if (err) {console.log(err);}
			rc.lrange(key, 0,-1,function(err,val) {
				res.send(arguments);
			})
		}
	);
});
app.post("/send_to_etsy", function() {
    console.log(JSON.stringify(req.files));
// iterate through uploaded files and created an ordered array of {image , time} objects
	try {
	    new ExifImage({ image : 'myImage.jpg' }, function (error, image) {
	        if (error)
	            console.log('Error: '+error.message);
	        else
	            console.log(image); // Do something with your data!
	    });
	} catch (error) {
	    console.log('Error: ' + error);
	}
	var key = "user_" + req.user("session_id");
	rc.lrange(key,0,-1,function(err,val) {
		var i;
		for (i in val) {
			data = val[i].split(":");
			listing_id = data[1];
			time = data[2];
			oa.post(
				"http://openapi.etsy.com/v2/listings/" + listing_id + "/images",
				req.user("oauth_access_token"),
				req.user("oauth_access_token_secret"),
				post_body,
				"multipart/form-data",
				function (err, data, response) {
					data = JSON.parse(data).results[0];
				}
			);
		}
	})
})
app.listen(app.get('port'));

