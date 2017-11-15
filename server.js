'use strict'

var express = require("express"),
    https = require("https"),
    path = require("path"),
    MongoClient = require("mongodb").MongoClient,
    port = process.env.PORT || 3000,
    api_id = process.env.API_ID,
    api_key = process.env.API_KEY,
    dbUrl = "mongodb://" + process.env.DBUSER + ":" + process.env.DBPASS + process.env.DBLINK,
    collection = "img_search",

    app = express();
    process.env.NODE_ENV = "production";
    
app.use(express.static(path.join(__dirname, "public")));


app.get('/favicon.ico', function(req, res) {
    res.status(204);
});

app.get("/imagesearch", function(req, res) {
   
    MongoClient.connect(dbUrl, function(err, db) {
        if (err) throw err;
        db.collection(collection).find({}, {_id: 0, term: 1, "search-time": 1}).sort({_id: -1}).limit(10)
            .toArray(function(error, documents) {
                if (error) throw error;
                if (documents.length) {
                    res.set({status: 200, 'content-type': 'application/json' });
                    res.send(JSON.stringify(documents));
                    db.close();
                } else {
                    res.set({status: 200, 'content-type': 'application/json' });
                    res.send(JSON.stringify({"info": "No data in Database yet!"}));
                    db.close();
                }
        });
    }); 
});

app.get("/*", function(req, res) {
    
    var searchStr = req.params[0].split(/\s/).join("+"),
        offset = req.query.offset,
        template = "https://www.googleapis.com/customsearch/v1?q=" + searchStr + "&cx=" + encodeURIComponent(api_id) + "&start=" + offset + "&num=10&key=" + api_key,        
        jsonRes = "";

    // INSERT new search into database
    MongoClient.connect(dbUrl, function(err, db) {
        if (err) throw err;
        var time = new Date();
        db.collection(collection).insert(
            {
                term: req.params[0].split(/\s/).join(" "),
                "search-time": new Date()
            }
        );
        db.close();            
    });
    // GET data from SEARCH
    https.get(template, function(response) {
    
        response.on("error", function(e) {console.error("There was a problem making a search request: " + e);})
        response.on("data", function(d) {jsonRes += d;})
        response.on("end", function() {            
            res.set({status: 200, "content-type": "application/json" });
            res.send(formatData(jsonRes));
            });
    });
});


app.listen(port);



function formatData(json) {

    var resultJSON = JSON.parse(json),
        result = {};

    if (typeof resultJSON !== "object" || !resultJSON) {return {"error":"No search data was returned!"};}
    if (!resultJSON.items) {return {"error": "No search items were returned by the search!"};}

    resultJSON.items.forEach(function(item, index) {

        var url = ((((item.pagemap || {})["cse_image"] || {})[0] || [])["src"] || "No url found") ||
                  ((((item.pagemap || {})["metatags"]  || {})[0] || [])["og:image"] || "No url found")
                  (item || {})["link"],
            snippet = item.title || item.snippet || "No snippet found",
            thumbnail = (((item.pagemap || {})["cse_thumbnail"] || {})[0] || [])["src"] || "No thumbnail found!";

        result = Object.assign({}, result, {
                    [index] : { url: url,
                                snippet: snippet,
                                thumbnail: thumbnail,
                                context: item.link
                    }
        });
    });

    return result;
}