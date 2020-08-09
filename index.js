require('dotenv').config();
const https = require('follow-redirects').https;
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { join } = require('path');
const log = require('log-to-file');
const JSONdb = require('simple-json-db');
const simpleGit = require('simple-git');
const { exec } = require('child_process');

const moduleJSONdb = new JSONdb(join(__dirname, 'foundryApi/modules.json'));
const systemJSONdb = new JSONdb(join(__dirname, 'foundryApi/systems.json'));
const fetchDurationJSONdb = new JSONdb(join(__dirname, 'foundryApi/fetchDuration.json'));

// env vars
const githubToken = process.env.GITHUB_TOKEN;
const botUser = process.env.BOT_USER;
const botUserEmail = process.env.BOT_USER_EMAIL;
const repoUrl = process.env.REPO_URL;

// github info
const remote = `https://${botUser}:${githubToken}@${repoUrl}`;
const branch = "api";

/** @type {import('simple-git').SimpleGitOptions} */
const gitOptions = {
    baseDir: join(__dirname, "foundryApi")
};

/** @type {import('simple-git').SimpleGit} */
const git = simpleGit(gitOptions);


/* -------------------------< timeout >----------------------- */

const timeout = 15; // timeout in minutes

const interval = minutesToMS(timeout); // timeout in ms




/* -------------------------< init >----------------------- */

git.init();

git.pull(remote, branch, { '--rebase': 'true' });

getData();
setInterval(getData, interval);



/* -------------------------< gets the data >----------------------- */

async function getData() {
    let fetchStart = Date.now();
    let workingObject = {};
    let moduleList = [];
    let systemList = [];

    let moduleHtmlString = await getScript("https://foundryvtt.com/packages/modules");
    let moduleDom = new JSDOM(moduleHtmlString);

    let modulesHTMLCollection = moduleDom.window.document.body.getElementsByClassName("article package");


    let systemHTMLString = await getScript("https://foundryvtt.com/packages/systems");
    let systemDom = new JSDOM(systemHTMLString);

    let systemHTMLCollection = systemDom.window.document.body.getElementsByClassName("article package");

    // modules
    let i = 0;
    for (let moduleHTML of modulesHTMLCollection) {
        i++;
        workingObject[`module${i}`] = "";
        setTimeout((function (num) {
            return async function () {

                try {
                    /** @type {string} */
                    const foundryUrl = moduleHTML.getElementsByClassName("article-title")[0].firstElementChild.href.trim();
                    const updateDate = moduleHTML.getElementsByClassName("tag updated")[0].textContent.trim();
                    /** @type {string} */
                    const manifestUrl = moduleHTML.getElementsByClassName("fas fa-download")[0].nextElementSibling.href.trim();
                    /** @type {{name:string,title:string,description:string,version:string,author:string,languages:[{lang:string,name:string,path:string}],minimumCoreVersion:string,compatibleCoreVersion:string,url:string,manifest:string,download:string,foundryUrl:string,lastUpdate:string}} */
                    let manifest = await JSON.parse(await getScript(manifestUrl));
                    if (manifest.name) {
                        manifest = { ...manifest, ...{ "foundryUrl": foundryUrl, "lastUpdate": updateDate } };

                        // push to 
                        moduleList.push(manifest);
                    }
                } catch (e) {
                    log(e, 'error.log');
                } finally {
                    delete workingObject[`module${num}`];
                }
            };
        })(i), i * 500);
    }

    // systems
    let j = 0;
    for (let systemHTML of systemHTMLCollection) {
        j++;
        workingObject[`system${j}`] = "";
        setTimeout((function (num) {
            return async function () {

                try {
                    /** @type {string} */
                    const foundryUrl = systemHTML.getElementsByClassName("article-title")[0].firstElementChild.href.trim();
                    const updateDate = systemHTML.getElementsByClassName("tag updated")[0].textContent.trim();
                    /** @type {string} */
                    const manifestUrl = systemHTML.getElementsByClassName("fas fa-download")[0].nextElementSibling.href.trim();
                    /** @type {{name:string,title:string,description:string,version:string,author:string,languages:[{lang:string,name:string,path:string}],minimumCoreVersion:string,compatibleCoreVersion:string,url:string,manifest:string,download:string,foundryUrl:string,lastUpdate:string}} */
                    let manifest = await JSON.parse(await getScript(manifestUrl));
                    if (manifest.name) {
                        manifest = { ...manifest, ...{ "foundryUrl": foundryUrl, "lastUpdate": updateDate } };

                        // push to 
                        systemList.push(manifest);
                    }
                } catch (e) {
                    log(e, 'error.log');
                } finally {
                    delete workingObject[`system${num}`];
                }
            };
        })(j), j * 500);
    }

    while (Object.keys(workingObject).length !== 0) {
        await pause(1000);
    }

    await setupModuleApi(moduleList);

    await setupSystemApi(systemList);

    await setupFetchDuration(fetchStart);

    git.add(join(__dirname, "foundryApi"))
        .addConfig('user.name', botUser)
        .addConfig('user.email', botUserEmail)
        .commit("automated update")
        .push(remote, branch)
        .pull()
        .then(() => {
            exec("git reflog expire && git repack -ad && git prune", { cwd: join(__dirname, "foundryApi") });
        });

    log("fetched", "default.log");

};



/* -------------------------< apis >----------------------- */

function setupModuleApi(moduleList) {
    return new Promise(resolve => {
        const updateTime = new Date(Date.now()).toUTCString();
        moduleJSONdb.JSON({ "updated": updateTime, "modules": moduleList });
        moduleJSONdb.sync();
        resolve();
    });
}

function setupSystemApi(systemList) {
    return new Promise(resolve => {
        const updateTime = new Date(Date.now()).toUTCString();
        systemJSONdb.JSON({ "updated": updateTime, "modules": systemList });
        systemJSONdb.sync();
        resolve();
    });
}

function setupFetchDuration(fetchStart) {
    return new Promise(resolve => {
        const now = Date.now();
        const duration = now - fetchStart;
        fetchDurationJSONdb.JSON({ "duration": `${Math.ceil(duration / 1000)}s`, "miliseconds": duration, "timeout": interval });
        fetchDurationJSONdb.sync();
        resolve();
    });
}



/* ------------------------< functions >------------------------- */

/**
 * @param  {number} ms miliseconds to wait
 */
function pause(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

function getScript(url) {
    return new Promise((resolve, reject) => {

        const client = https;

        client.get(url, (resp) => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                resolve(data);
            });

        }).on("error", (err) => {
            reject(err);
        });
    });
}

function minutesToMS(minutes) {
    return (minutes * 60 * 1000);
}



