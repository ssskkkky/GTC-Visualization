const PlotlyData = require('./PlotlyData.js');
const PlotType = require('./PlotType.js');
const util = require('./util.js');

const particlePlotTypes =
    ['density', 'flow', 'energy', 'PDF_energy', 'PDF_pitch'];
const fieldNames = ['phi', 'apara', 'fluidne'];
const fieldPlotTypes = ['flux', 'spectrum', 'poloidal', 'psi', 'theta'];

/**
 * Snapshot class containing all data from snap*******.out
 */
class Snapshot extends PlotType {
    /**
     * @param {{iter:Iterator<string>, path: string}} data 
     * @param {Object} basicParams GTCOutput.parameters
     */
    constructor(data, basicParams) {
        super(data, basicParams)

        let iter = data.iter;

        // basic parameters
        this.speciesNum = parseInt(iter.next().value);
        this.fieldNumber = parseInt(iter.next().value);
        this.velocityGridNumber = parseInt(iter.next().value);
        this.radialGridPtNum = parseInt(iter.next().value);
        this.poloidalGridPtNum = parseInt(iter.next().value) - 1;
        this.toroidalGridPtNum = parseInt(iter.next().value);
        this.maxEnergy = parseFloat(iter.next().value);

        this.plotTypes = [
            ...this.existingParticles.map(t => particlePlotTypes.map(p => t + '-' + p)),
            ...fieldNames.map(f => fieldPlotTypes.map(p => f + '-' + p))
        ];

        // particle data, including profile of torques and pdf of energy and pitch angle
        this.particleData = new Object();
        // first three panel of particlePlotTypes, one dimension along radial direction
        this._slice_particle(iter, 0, 3, this.radialGridPtNum);
        // next two panel of particlePlotTypes, one dimension along velocity or pitch angle
        this._slice_particle(iter, 3, 5, this.velocityGridNumber);

        // field data, including poloidal plane and flux 
        this.fieldData = new Object();
        // poloidal plane data, with x and y coordinates, dimension = (fieldNum + 2 ,r, theta)
        this._slice_field(iter, 'poloidalPlane', this.radialGridPtNum);
        // flux data, dimension = (fieldNum, zeta, theta)
        this._slice_field(iter, 'fluxData', this.toroidalGridPtNum);

        // check if the snap*******.out file ends
        PlotType.checkEnd(data);
    }

    /**
     * Generate plot data as per specifications of Plotly library.
     * 
     * @param {string} plotType
     * 
     * @returns {Array<PlotlyData>}
     */
    plotData(plotType) {
        // cat is the category of the plot, could be particle name or field name
        // type is the type of the plot, one of strings in particlePlotType or fieldPlotType
        let [cat, type] = plotType.split('-');
        let figureContainer = new Array();
        let fig = new PlotlyData();

        if (fieldNames.includes(cat)) {
            // field
            let index = fieldPlotTypes.indexOf(type);
            switch (index) {
                case 0: // field strength on flux surface
                    fig.data.push({
                        z: this.fieldData['fluxData'][cat],
                        type: 'heatmap',
                        colorbar: {
                            tickformat: '.4g'
                        },
                        transpose: true
                    });
                    fig.axesLabel = { x: 'nzeta', y: 'mtheta' };
                    fig.plotLabel = `${cat} on flux surface`;
                    figureContainer.push(fig);
                    break;
                case 1: // poloidal and parallel spectrum
                    // This figure involves some interaction, so data will be generate on client side
                    let figs = Array.from({ length: 2 }, _ => new PlotlyData());
                    figs.forEach((fig, i) => {
                        fig.data.push({
                            type: 'scatter',
                            mode: 'lines'
                        })
                        fig.plotLabel = (i == 0 ? 'poloidal' : 'parallel') + ' spectrum';
                    })
                    figs.push({ extraData: this.fieldData['fluxData'][cat] });
                    figureContainer = figs;
                    break;
                case 2: // field strength on poloidal plane
                    let thetaMesh = util.flat(Array.from({ length: this.radialGridPtNum },
                        _ => util.range(this.poloidalGridPtNum + 1)));
                    let psiMesh = util.flat(util.range(this.radialGridPtNum)
                        .map(i => Array(this.poloidalGridPtNum + 1).fill(i)));
                    let polData = this.fieldData['poloidalPlane'];
                    // add carpet
                    fig.data.push({
                        a: thetaMesh,
                        b: psiMesh,
                        x: util.flat(polData['x']),
                        y: util.flat(polData['y']),
                        type: 'carpet'
                    })
                    fig.hideCarpetGrid();
                    // add contour
                    fig.data.push({
                        a: thetaMesh,
                        b: psiMesh,
                        z: util.flat(polData[cat]),
                        type: 'contourcarpet',
                        contours: {
                            showlines: false
                        },
                        colorbar: {
                            tickformat: '.4g'
                        }
                    })
                    fig.axisEqual();
                    fig.plotLabel = `${cat} on poloidal plane`;
                    figureContainer.push(fig);

                    let fig2 = new PlotlyData();
                    fig2.axesLabel = { x: 'mpsi', y: '' };
                    fig2.plotLabel = `${cat} mode profile`
                    figureContainer.push(fig2);
                    figureContainer.push({
                        polNum: this.poloidalGridPtNum,
                        radNum: this.radialGridPtNum
                    })
                    break;
                case 3: case 4: // profile of field and rms
                    let field = this.fieldData['poloidalPlane'][cat];
                    // point value
                    let fig0 = new PlotlyData();
                    fig0.data.push({
                        y: type === 'psi' ?
                            field.map(pol => pol[0]) :
                            field[(this.radialGridPtNum - 1) / 2],
                        type: 'scatter',
                        mode: 'lines'
                    });
                    fig0.addX(1, 0);
                    fig0.axesLabel = { x: type === 'psi' ? 'mpsi' : 'mtheta', y: '' };
                    fig0.plotLabel = 'point value'
                    figureContainer.push(fig0);
                    // RMS
                    let fig1 = new PlotlyData();
                    fig1.data.push({
                        y: type === 'psi' ?
                            field.map(pol => Math.sqrt(pol.reduce(
                                (acc, curr) => acc + curr * curr, 0) / this.poloidalGridPtNum)) :
                            field
                                .reduce((acc, curr) => {
                                    acc.forEach((v, i) => { acc[i] = v + curr[i] * curr[i] },
                                        Array(this.poloidalGridPtNum).fill(0));
                                    return acc;
                                }, Array(this.poloidalGridPtNum).fill(0))
                                .map(v => Math.sqrt(v / (this.radialGridPtNum - 1))),
                        type: 'scatter',
                        mode: 'lines'
                    });
                    fig1.addX(1, 0);
                    fig1.axesLabel = { x: type === 'psi' ? 'mpsi' : 'mtheta', y: '' };
                    fig1.plotLabel = 'RMS';
                    figureContainer.push(fig1);
                    break;
            }
        } else if (this.existingParticles.includes(cat)) {
            // particle
            let figs = Array.from({ length: 2 }, _ => new PlotlyData());
            figs.forEach((fig, i) => {
                fig.data.push({
                    y: this.particleData[cat][type][i],
                    type: 'scatter',
                    mode: 'lines'
                });
                fig.addX(1, 0);
                fig.axesLabel = { x: type.startsWith('PDF') ? '' : 'mpsi', y: '' };
                fig.plotLabel = (i == 0 ? 'full-f' : 'delta-f') + ' ' + type;
            });
            figureContainer = figs;
        } else {
            throw new Error('Incorrect figure type');
        }

        return figureContainer;
    }


    _slice_particle(iter, m, n, len) {
        for (let particle of this.existingParticles) {
            if (this.particleData[particle] === undefined) {
                this.particleData[particle] = new Object();
            }
            for (let type = m; type < n; type++) {
                this.particleData[particle][particlePlotTypes[type]] =
                    Array.from({ length: 2 },
                        _ => Array.from({ length: len },
                            _ => parseFloat(iter.next().value)));
            }
        }
    }

    _slice_field(iter, type, len) {
        this.fieldData[type] = new Object();
        for (let field of fieldNames.concat(type === 'poloidalPlane' ? ['x', 'y'] : [])) {
            let tmp = this.fieldData[type][field] = new Array();
            for (let r = 0; r < len; r++) {
                tmp.push(Array.from({ length: this.poloidalGridPtNum + 1 },
                    _ => parseFloat(iter.next().value)));
            }
        }
    }

}

module.exports = Snapshot;
