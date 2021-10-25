#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";
const https = require('https');
const express = require("express");
const hbs = require("express-handlebars");
const bodyparser = require("body-parser");
const session = require("express-session");
const busboy = require("connect-busboy");
const flash = require("connect-flash");
const querystring = require("querystring");
const dotenv = require('dotenv');
const schedule = require('node-schedule');

const archiver = require("archiver");

const notp = require("notp");
const base32 = require("thirty-two");

const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");

const filesize = require("filesize");
const octicons = require("octicons");
const handlebars = require("handlebars");
var dateFormat = require('dateformat');

const Web3 = require('Web3');
const { auth, requiresAuth } = require('express-openid-connect');
const crypto = require('crypto');
const PrivateKeyProvider = require("truffle-hdwallet-provider");
const TruffleContract = require('@truffle/contract');
const truffleConfig = require(path.join(__dirname, "truffle-config.js"));
const FactoryArtifact = require(path.join(__dirname, "build", "contracts", "Factory.json"));
const CloudSLAArtifact = require(path.join(__dirname, "build", "contracts", "CloudSLA.json"));
const utils = require(path.join(__dirname, "public", "assets", "utils"));

const srcdir =  path.join(__dirname, "public");

dotenv.config();
const options = {
  key: fs.readFileSync( "cloudchain.com+4-key.pem", "utf-8"),
  cert: fs.readFileSync("cloudchain.com+4.pem", "utf-8"),
};

const app = express();
const port = process.env.PORT || 443;
const hostname = process.env.ISSUER_BASE_URL || "https://cloudchain.com";
https.createServer(options, app).listen(port);
//https.globalAgent.options.ca = require('ssl-root-cas').create();

const httpApp = express();
const http = require('http');
httpApp.get("*", function(req, res, next) {
    res.redirect("https://" + req.headers.host + req.path);
});
http.createServer(httpApp).listen(80);

app.set("views", path.join(srcdir, "views"));
app.engine("handlebars", hbs({
	partialsDir: path.join(srcdir, "views", "partials"),
	layoutsDir: path.join(srcdir, "views", "layouts"),
	defaultLayout: "main",
	helpers: {
		either: function(a, b, options) {
			if (a || b) {
				return options.fn(this);
			}
		},
		filesize: filesize,
		octicon: function(i, options) {
			if (!octicons[i]) {
				return new handlebars.SafeString(octicons.question.toSVG());
			}
			return new handlebars.SafeString(octicons[i].toSVG());
		},
		eachpath: function (path, options) {
			if (typeof path != "string") {
				return "";
			}
			let out = "";

			path = hidePath(path);
			path = path.split("/");
			path.splice(path.length - 1, 1);
			path.unshift("");
			path.forEach((folder, index) => {
					out += options.fn({
					name: folder + "/",
					path: "/" + path.slice(1, index + 1).join("/"),
					current: index === path.length - 1
				});
			});
			return out;
		},
	}
}));
app.set("view engine", "handlebars");

app.use("/@assets", express.static(path.join(srcdir, "assets")));
app.use("/@assets/bootstrap", express.static(path.join(__dirname, "node_modules/bootstrap/dist")));
app.use("/@assets/octicons", express.static(path.join(__dirname, "node_modules/octicons/build")));
app.use("/@assets/filesize", express.static(path.join(__dirname, "node_modules/filesize/lib")));
app.use("/@assets/xterm", express.static(path.join(__dirname, "node_modules/xterm")));
app.use("/@assets/xterm-addon-attach", express.static(path.join(__dirname, "node_modules/xterm-addon-attach")));
app.use("/@assets/xterm-addon-fit", express.static(path.join(__dirname, "node_modules/xterm-addon-fit")));

app.use(session({
	secret: process.env.SESSION_KEY || "meowmeow",
	resave: false,
	saveUninitialized: false
}));
app.use(flash());
app.use(busboy());
app.use(express.urlencoded({ extended: true }))

var accounts = {"auth0|615afaf5c69eb200704af4b8" : "0x627306090abaB3A6e1400e9345bC60c78a8BEf57"}
var truffleContracts = {}

//Initialize CloudSLA interaction 
const provider = truffleConfig.networks.quickstartWallet.provider();
const account = provider.getAddress(); // 0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73
console.log("Cloud address: " + account);

const price = 5 * (10**18); //5 ether in wei
const monthlyValidityDuration = 30 * 24 * 60 * 60; //1 month in seconds
const testValidityDuration = 60 * 60; //1 hour in seconds

var truffleContract = TruffleContract(FactoryArtifact);
truffleContract.setProvider(provider);
var truffleContractInstance;

//event listening in truffle only works with events fired by own account
	//so we have to use web3
var web3 = new Web3(provider);

truffleContract.deployed().then(function(instance) {
  truffleContractInstance = instance;

	const web3ContractInstance = new web3.eth.Contract(
	    FactoryArtifact.abi,
	    truffleContractInstance.address,
	);

	let user = '0x627306090abaB3A6e1400e9345bC60c78a8BEf57';
	truffleContractInstance.createChild(user, String(price), String(testValidityDuration), 1, 1, {from: account})
      .then(function(txReceipt) {
      	console.log("--SC Created--");
	      //console.log(txReceipt);
	    }).catch(function(err) {
			  console.log(err.message);
			});

	web3ContractInstance.events.ChildCreated({})
	    .on('data', async function(event){
        let scAddress = event.returnValues.childAddress;
        let userAddress = event.returnValues._user;
        generateTruffleInstance(scAddress, userAddress)
        .then(truffleInstance => {
        	truffleContracts[userAddress] = truffleInstance;
        	attachEventListeners(scAddress, userAddress);
        })
        .catch(err => {console.log(err);});    
    })
	  .on('error', console.error);

}).catch(function(err) {
  console.log(err.message);
});

function attachEventListeners(scAddress, userAddress){
	const userWeb3ContractInstance = new web3.eth.Contract(
	    CloudSLAArtifact.abi,
	    scAddress,
	);

	let userTruffleContractInstance = truffleContracts[userAddress];
	userWeb3ContractInstance.events.Paid({})
    .on('data', async function(event){
        console.log("--SC Activated--");
        let user = event.returnValues._from;
        let endTime = parseInt(event.returnValues.endTime) + 1;
        const date = new Date(endTime * 1000);
        const job = schedule.scheduleJob(date, function(){
				  userTruffleContractInstance.EndSla({from: account})
		      .then(function(txReceipt) {
		      	console.log("--SLA ended--");
			      //console.log(txReceipt);
			    }).catch(function(err) {
					  console.log(err.message);
					});
				});
    })
	  .on('error', console.error);

	userWeb3ContractInstance.events.UploadRequested({})
    .on('data', async function(event){
        console.log("--Upload Request Received--");
        let file = event.returnValues.filepath;
        
        userTruffleContractInstance.UploadRequestAck(file, {from: account})
        .then(function(txReceipt) {
        	console.log("--UploadRequestAck--");
		      console.log(txReceipt);

		    }).catch(function(err) {
				  console.log(err.message);
				});
    })
	  .on('error', console.error);

 userWeb3ContractInstance.events.DeleteRequested({})
  .on('data', async function(event){
      console.log("--Delete Request Received--");
      let file = event.returnValues.filepath;
      let user = event.returnValues._from;
      let filepath = hidePath(file, user, false);
      deleteFile(filepath);
      
      userTruffleContractInstance.Delete(file, {from: account})
      .then(function(txReceipt) {
      	console.log("--Delete--");
	      console.log(txReceipt);

	    }).catch(function(err) {
			  console.log(err.message);
			});
  })
  .on('error', console.error);

	userWeb3ContractInstance.events.ReadRequested({})
  .on('data', async function(event){    
  		console.log("--Read Request Received--");
      let file = event.returnValues.filepath;
      let user = event.returnValues._from;
      let filepath = hidePath(file, user, false);

      let fileExists = new Promise((resolve, reject) => {
			// check if file exists
			fs.stat(relative(filepath), (err, stats) => {
				if (err) {
					return reject(err);
				}
				return resolve(stats);
			});
		});

		fileExists.then((stats) => {
			let url = hostname + ":" + port + "/" + filepath;
			url = url.replace("\\", "/");
			userTruffleContractInstance.ReadRequestAck(file, url, {from: account})
	        .then(function(txReceipt) {
	        	console.log("--ReadRequestAck--");
			      console.log(txReceipt);
		    }).catch(function(err) {
				  console.log(err.message);
			});
		}).catch((err) => {
			userTruffleContractInstance.ReadRequestDeny(file, {from: account})
	        .then(function(txReceipt) {
	        	console.log("--ReadRequestDeny--");
			      console.log(txReceipt);
		    }).catch(function(err) {
				  console.log(err.message);
			});
		});
  })
  .on('error', console.error);
}

function generateTruffleInstance(scAddress, userAddress){
	return new Promise((resolve, reject) => {
		var myTruffleContract = TruffleContract(CloudSLAArtifact);
			myTruffleContract.setProvider(provider);
			myTruffleContract.at(scAddress)
			.then(function(userTruffleContractInstance) {
				truffleContracts[userAddress] = userTruffleContractInstance;
				resolve(userTruffleContractInstance);
			})
			.catch(function(error){
				reject("No SC found.")
			})
	});
}

// AUTH
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SESSION_KEY,
  baseURL: hostname + ":" + port,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: 'https://dev--0grxkki.us.auth0.com',
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

function relative(...paths) {
	return paths.reduce((a, b) => path.join(a, b), process.cwd());
}
function flashify(req, obj) {
	let error = req.flash("error");
	if (error && error.length > 0) {
		if (!obj.errors) {
			obj.errors = [];
		}
		obj.errors.push(error);
	}
	let success = req.flash("success");
	if (success && success.length > 0) {
		if (!obj.successes) {
			obj.successes = [];
		}
		obj.successes.push(success);
	}
	return obj;
}

app.all("/*", (req, res, next) => {
	res.filename = req.params[0];
	if(req.oidc.isAuthenticated())
		res.filename = hidePath(res.filename, accounts[req.oidc.user.sub], false);
	res.filename = res.filename.replace("@read", "");

	let fileExists = new Promise((resolve, reject) => {
		// check if file exists
		fs.stat(relative(res.filename), (err, stats) => {
			if (err) {
				return reject(err);
			}
			return resolve(stats);
		});
	});

	fileExists.then((stats) => {
		res.stats = stats;
		next();
	}).catch((err) => {
		res.stats = { error: err };
		next();
	});
});

app.get("/", (req, res) => {
	if(req.oidc.isAuthenticated()) 
		res.redirect("/mycloud");
	else
		res.render("list", {notloggedin: true});
})

app.get("/build/contracts/*", readFile);
app.get("/mycloud*", requiresAuth(), readDirOrFile);
app.get("/*@read", (req, res) => {
	if (res.stats.error) {
		res.render("list", flashify(req, {
			path: res.filename,
			errors: [
				"Error fetching resource."
			],
			notloggedin: !req.oidc.isAuthenticated()
		}));
	}
	else if (res.stats.isFile()) {
		res.render("read-file", flashify(req, {
			notloggedin: !req.oidc.isAuthenticated()
		}))
	}
})
app.get("/storage*", readFile);

app.post("/*@upload", requiresAuth(), (req, res) => {
	res.filename = req.params[0];
	let userAccount = accounts[req.oidc.user.sub];
	res.filename = hidePath(res.filename, userAccount, false);

	let buff = null;
	let saveas = null;
	req.busboy.on("file", (key, stream, filename) => {
		if (key == "file") {
			let buffs = [];
			stream.on("data", (d) => {
				buffs.push(d);
			});
			stream.on("end", () => {
				buff = Buffer.concat(buffs);
				buffs = null;
			});
		}
	});
	req.busboy.on("field", (key, value) => {
		if (key == "saveas") {
			saveas = value;
		}
	});
	req.busboy.on("finish", () => {
		if (!buff || !saveas) {
			req.flash("error", "File is not valid");
			res.redirect("back");
		}
		else{
			let fileCanBeUploaded = new Promise((resolve, reject) => {
				if(truffleContracts.hasOwnProperty(userAccount)){
					let truffleContractInstance = truffleContracts[userAccount]
					let url = req.path.slice(1, req.path.indexOf("@upload"));
					let filepath = url + saveas;
					truffleContractInstance.GetFile.call(filepath)
			      	.then(function (res) { 
				      	return resolve(res);
				      }).catch(function(err) {
							  return reject("File can't be uploaded as it is not in the Blockchain.");
							});
				}else{
					return reject("Server contract error.");
				}
			});

			let fileNotExist = new Promise((resolve, reject) => {
				// check if file exists
				fs.stat(relative(res.filename, saveas), (err, stats) => {
					if (err) {
						return resolve(err);
					}
					return reject("File exists, cannot overwrite. ");
				});
			});

			Promise.all([fileCanBeUploaded, fileNotExist]).then((msg) => {
				const saveName = relative(res.filename, saveas);
				console.log("saving file to " + saveName);
				let save = fs.createWriteStream(saveName);
				save.on("close", () => {
					fileHash(saveName)
						.then(function(hash){
							let url = req.path.slice(1, req.path.indexOf("@upload"));
							let filepath = url + saveas;

							if(truffleContracts.hasOwnProperty(userAccount)){
								let truffleContractInstance = truffleContracts[userAccount]
								truffleContractInstance.UploadTransferAck(filepath, hash, {from: account})
				        .then(function(txReceipt) {
				        	console.log("--UploadTransferAck--");
						      console.log(txReceipt);
						    }).catch(function(err) {
								  console.log(err.message);
								});
							}else{
								throw "No SC found.";
							}
						})
						.catch(function(error){console.log(error);});
					if (res.headersSent) {
						return;
					}
					if (buff.length === 0) {
						req.flash("success", "Upload successful. Warning: empty file.");
						
					}
					else {
						buff = null;
						//req.flash("success", "Upload successful.");
					}
					res.redirect("back");
				});
				save.on("error", (err) => {
					console.warn(err);
					req.flash("error", err.toString());
					res.redirect("back");
				});
				save.write(buff);
				save.end();	
			}).catch((err) => {
				console.warn(err);
				req.flash("error", err);
				res.redirect("back");
			});
		}
		
	});
	req.pipe(req.busboy);
});

app.post("/*@mkdir", requiresAuth(), (req, res) => {
	res.filename = req.params[0];
	res.filename = hidePath(res.filename, accounts[req.oidc.user.sub], false);

	let folder = req.body.folder;
	if (!folder || folder.length < 1) {
		return res.status(400).end();
	}

	let fileExists = new Promise((resolve, reject) => {
		// Check if file exists
		fs.stat(relative(res.filename, folder), (err, stats) => {
			if (err) {
				return reject(err);
			}
			return resolve(stats);
		});
	});

	fileExists.then((stats) => {
		req.flash("error", "Folder exists, cannot overwrite. ");
		res.redirect("back");
	}).catch((err) => {
		fs.mkdir(relative(res.filename, folder), (err) => {
			if (err) {
				console.warn(err);
				//req.flash("error", err.toString());
				res.redirect("back");
				return;
			}
			req.flash("success", "Folder created. ");
			res.redirect("back");
		});
	});
});

function deleteFile(file){
	let promise = new Promise((resolve, reject) => {
			fs.stat(file, (err, stats) => {
				if (err) {
					return reject(err);
				}
				resolve({
					filepath: file,
					isdirectory: stats.isDirectory(),
					isfile: stats.isFile()
				});
			});
		});

	promise.then((f) => {
		let promise = new Promise((resolve, reject) => {
				let op = null;
				if (f.isdirectory) {
					op = (dir, cb) => rimraf(dir, {
						glob: false
					}, cb);
				}
				else if (f.isfile) {
					op = fs.unlink;
				}
				if (op) {
					op(f.filepath, (err) => {
						if (err) {
							return reject(err);
						}
						resolve();
					});
				}
			});

		promise.then(() => {
			//req.flash("success", "Files deleted. ");
		}).catch((err) => {
			console.warn(err);
			//req.flash("error", "Unable to delete some files: " + err);
		});
	}).catch((err) => {
		console.warn(err);
		//req.flash("error", err.toString());
	});
}

function fileHash(filepath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    // Algorithm depends on availability of OpenSSL on platform
    // Another algorithms: 'sha1', 'md5', 'sha256', 'sha512' ...
    if(fs.lstatSync(filepath).isDirectory()){
    	return resolve('-');
    }else{
    	let shasum = crypto.createHash(algorithm);
	    try {
	      let s = fs.ReadStream(filepath)
	      s.on('data', function (data) {
	        shasum.update(data)
	      })
	      // making digest
	      s.on('end', function () {
	        const hash = shasum.digest('hex')
	        return resolve("0x" + hash);
	      })
	    } catch (error) {
	      return reject('calc fail');
	    }
    }
  });
}

function hidePath(path, userId, hide=true){	
	if(hide){
		path = path.replace("storage/", "");
		path = path.replace(path.substring(0, path.indexOf("/")), "mycloud");
		return(path);
	}
	else 
		return path.replace("mycloud", "storage/user" + userId);
}

function readFile(req, res){
	if (res.stats.error) {
		res.render("list", flashify(req, {
			path: res.filename,
			errors: [
				"Error fetching resource."
			],
			notloggedin: !req.oidc.isAuthenticated()
		}));
	}
	else if (res.stats.isFile()) {
		res.sendFile(relative(res.filename), (err) => {
    	if (err) console.log(err);
  	});
	}
}

function readDirOrFile(req, res){
	//console.log(JSON.stringify(req.oidc.user, null, 2));
	if (res.stats.error) {
		res.render("list", flashify(req, {
			path: res.filename,
			errors: [
				"Error fetching resource."
			],
			notloggedin: !req.oidc.isAuthenticated()
		}));
	}
	else if (res.stats.isDirectory()) {
		if (!req.url.endsWith("/")) {
			return res.redirect(req.url + "/");
		}

		let readDir = new Promise((resolve, reject) => {
			fs.readdir(relative(res.filename), (err, filenames) => {
				if (err) {
					return reject(err);
				}
				return resolve(filenames);
			});
		});

		readDir.then((filenames) => {
			const promises = filenames.map(f => fileHash(relative(res.filename, f)).then((hash) => { 
				return new Promise((resolve, reject) => {
					fs.stat(relative(res.filename, f), (err, stats) => {
						if (err) {
							console.warn(err);
							return resolve({
								name: f,
								error: "Error fetching resource."
							});
						}
						resolve({
							name: f,
							isdirectory: stats.isDirectory(),
							size: stats.size,
							dateadded: dateFormat(stats.birthtime, "yyyy-mm-dd H:MM:ss"),
							digest : hash
						});
					});
				});
			}));

			Promise.all(promises).then((files) => {
				res.render("list", flashify(req, {
					path: res.filename,
					files: files,
					notloggedin: !req.oidc.isAuthenticated()
				}));
			}).catch((err) => {
				console.error(err);
				res.render("list", flashify(req, {
					path: res.filename,
					errors: [
						"Error fetching resource."
					],
					notloggedin: !req.oidc.isAuthenticated()
				}));
			});
		}).catch((err) => {
			console.warn(err);
			res.render("list", flashify(req, {
				path: res.filename,
				errors: [
					"Error fetching resource."
				],
				notloggedin: !req.oidc.isAuthenticated()
			}));
		});
	}
	else if (res.stats.isFile()) {
		res.sendFile(relative(res.filename), (err) => {
    	if (err) console.log(err);
  	});
	}
}


