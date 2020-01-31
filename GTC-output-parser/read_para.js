const path = require('path');
const fs = require('fs').promises;

// RegExp for output in the form 'var' = 'value'
const regexp = /\s*(?<key>[\w_]+)\s*=\s*(?<value>[\d.E+-]+)/i;

module.exports = async function (dir) {
    let file1 = path.join(dir, 'gtc.out');
    let file2 = path.join(dir, 'gtc.out0');
    let outputData;

    // try to read 'gtc.out' first, then 'gtc.out0' if the former
    //  one did not exist
    try {
        outputData = await fs.readFile(file1, 'utf8');
        console.log(`${file1} read`);
    } catch (err) {
        try {
            outputData = await fs.readFile(file2, 'utf8');
            console.log(`${file2} read`);
        } catch (err) {
            throw new Error("No gtc.out found in this directory");
        }
    }

    // filter out lines consist of '='
    let validatedData = outputData
        .split('\n')
        .filter(line => !line.includes('==') && line.includes('='));

    // return all the parameters capsuled in a object
    let params = new Object();
    validatedData
        .forEach(line => {
            let g = line.match(regexp).groups;
            let value;
            if (g.value.includes('.')) {
                value = parseFloat(g.value);
            } else {
                value = parseInt(g.value);
            }
            // n modes and m modes are list of mode numbers
            if(g.key === 'nmodes' || g.key === 'mmodes') {
                value = line
                    .substring(8)
                    .trim()
                    .split(/\s+/)
                    .map(str => parseInt(str));
            }
            params[g.key.toLowerCase()] = value;
        });

    return params;
}