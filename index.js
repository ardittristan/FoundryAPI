const https = require('follow-redirects').https;
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const log = require('log-to-file');
const JSONdb = require('simple-json-db');
const moduleJSONdb = new JSONdb('./foundryApi/modules.json', {asyncWrite: true})

let workingObject = {};
let moduleList = [];

const getScript = (url) => {
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
};


async function getModules() {
    workingObject = {}
    moduleList = []

    let htmlString = await getScript("https://foundryvtt.com/packages/modules");
    let dom = new JSDOM(htmlString);

    let modulesHTMLCollection = dom.window.document.body.getElementsByClassName("article package");


    
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
                    manifest = { ...manifest, ...{ "foundryUrl": foundryUrl, "lastUpdate": updateDate } };

                    // push to 
                    moduleList.push(manifest);
                    delete workingObject[`module${num}`];
                } catch (e) {
                    delete workingObject[`module${num}`];
                    log(e, 'error.log');
                }
            };
        })(i), i * 500);
    }

    setupManifestApi();


};



/* -------------------------< apis >----------------------- */

async function setupManifestApi() {
    while (Object.keys(workingObject).length !== 0) {
        await pause(1000);
    }
    const updateTime = new Date(Date.now()).toUTCString();
    moduleJSONdb.JSON({ "updated": updateTime, "modules": moduleList });
    moduleJSONdb.sync()
}
/**
 * @param  {number} ms miliseconds to wait
 */
function pause(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}




getModules();