const fs = require('fs');
const { exec } = require('child_process');
const PNGCrop = require('png-crop');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const colors = require('colors');
var screencapture = require('screencapture')
var keypress = require('keypress');
const sharp = require('sharp');

const screenshot_path = process.cwd() + "\\images\\";

const occurrences = (string, subString, allowOverlapping) => {
    string += "";
    subString += "";
    if (subString.length <= 0) return (string.length + 1);

    var n = 0,
        pos = 0,
        step = allowOverlapping ? 1 : subString.length;

    while (true) {
        pos = string.indexOf(subString, pos);
        if (pos >= 0) {
            ++n;
            pos += step;
        } else break;
    }
    return n;
}

const googleSearch = (title, options) => {
    const shouldInvert = title.toLowerCase().indexOf(' no ') >= 0;
    const searchTitle = shouldInvert ? title.replace(/ no /i, ' ') : title;

    console.log(`${colors.gray('Got question:')} ${title}`);
    console.log(`${colors.gray('Got options:')}  ${options.join(', ')}`);

    const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36' };
    const promises = ['', ...options].map(o => fetch(`https://www.google.com/search?q=${encodeURIComponent(searchTitle)}+${encodeURIComponent('"' + o + '"')}`, { headers }));
    Promise.all(promises.map(p => p.then(res => res.text()))).then((results) => {
        const $ = cheerio.load(results[0]);
        const genericSearch = results[0].toLowerCase();

        const optionsWithCounts = options.map(o => ({ name: o }));
        for (let i = 0; i < optionsWithCounts.length; ++i) {
            const result = results[i + 1];
            const $$ = cheerio.load(result);
            optionsWithCounts[i].scopedCount = parseInt($$('#resultStats').text().toLowerCase().replace('about ', '').replace(' results', '').replace(/,/g, ''), 10);
        }

        const sortedOptions = optionsWithCounts
            .map(o => ({ ...o, count: occurrences(genericSearch, o.name.toLowerCase(), true) }))
            .sort((o1, o2) => {
                if (o1.count === o2.count) {
                    return o1.scopedCount > o2.scopedCount ? -1 : 1;
                }
                return o1.count > o2.count ? -1 : 1;
            });

        if (shouldInvert) {
            sortedOptions.reverse();
        }

        console.log(shouldInvert ? colors.bgRed(colors.white('\nQuestion has NOT - reversing results\n')) : '');
        console.log(colors.bgBlack(colors.white(`Top Answer: ${sortedOptions[0].name} (${sortedOptions[0].count} - ${sortedOptions[0].scopedCount})`)));
        console.log();
        const resultSections = $('div.g');
        const first = resultSections.first();
        const next = first.next();
        const third = next.next();
        const four = third.next();
        const five = four.next();

        console.log('Google results:');
        console.log();
        [first, next, third].forEach(x => {
            console.log(`\t${x.find('h3.r').text()} [${x.find('cite').text().substring(0, 50)}...]`)
            x.find('span.st').text().split('\n').forEach(y => {
                console.log(`\t\t${y}`);
            });
            console.log();
        });

        console.log(JSON.stringify(sortedOptions, null, 2));
    });
}

const ocrImage = (path, sufix, config, ocrOpt, callback, preProcessImage = undefined) => {
    PNGCrop.crop(path, path + sufix + '.png', config, function (err) {
        if (err) throw err;

        var callOCR = (file) => {
            exec(`"C:/Program Files (x86)/Tesseract-OCR/tesseract.exe" ${ocrOpt} --tessdata-dir "C:/Program Files (x86)/Tesseract-OCR/tessdata" "${file}" "${path}${sufix}.log"`, (err, stdout, stderr) => {
                if (err) {
                    // node couldn't execute the command
                    console.log(`err: ${err}`);
                    return;
                }

                const contents = fs.readFileSync(`${path}${sufix}.log.txt`, 'utf8');
                callback(contents);
            });
        };

        if (preProcessImage)
            preProcessImage(path + sufix + ".png", callOCR);
        else
            callOCR(path + sufix + ".png");
    });
}

var questionData = {};

const collectData = (type, data) => {
    questionData[type] = data;
    if (questionData["title"] !== undefined && questionData["options"] !== undefined)
        googleSearch(questionData["title"], questionData["options"]);
}

const processImage = path => {
    questionData = {};
    ocrImage(path, ".title", { width: 770, height: 500, top: 570, left: 250 }, "", function (contents) {
        const lines = contents.split('\n').filter(x => x);
        const title = lines.slice(0, lines.length).join(' ');
        collectData("title", title);
        //collectData("title", "La Torre inclinada de Pisa est� en:");
    });
    ocrImage(path, ".options", { width: 770, height: 320, top: 1070, left: 250 }, "--psm 11", function (contents) {
        const lines = contents.split('\n').filter(x => x);
        const options = lines.slice(0, lines.length);
        collectData("options", options);
        //collectData("options", [ "Florencia", "Venecia", "Ninguna de las anteriores" ]);
    }/*,
    function (imagePath, callOCR) {
        sharp(imagePath)
            //.negate().removeAlpha()
            .normalize()
            .sharpen(1)
            .toFile(imagePath + ".process.png", (err, info) => {
                if (err)
                    console.log(err);
                callOCR(imagePath + ".process.png");
            });
    }*/);
}

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

// listen for the "keypress" event
process.stdin.on('keypress', function (ch, key) {
    //console.log('got "keypress"', key);
    if (key && key.ctrl && key.name === 'a') {
        fs.unlink(screenshot_path + 'test.png', function (err) {
            if (err)
                console.log('Error deleting file');

            screencapture(screenshot_path + 'test.png', function (err, imagePath) {
                //processImage(imagePath);
                processImage(screenshot_path + "q12.png");
            });
        });
    }
    else if (key && key.ctrl && key.name === 'c')
        process.exit(0);
});

process.stdin.setRawMode(true);
process.stdin.resume();

// INFO: teseando con este video: https://youtu.be/C9FpV3lLeww?t=247
