//fields with mandatory action - these will overwrite any custom rule in the anonymizer
//todo: per modality actions
module.exports = {
    "general": {
        'x00020012': {action: 'replace', value: null},
        'x00020013': {action: 'replace', value: null},
        'x00120063': {action: 'replace', value: null},
        'x00120064': {action: 'replace', value: null},
        "x00100010": { action: "replace", value: null},
        "x00100020": { action: "replace", value: null},
        "x00100030": { action: "replace", value: null},
        "x00100040": { action: "copy", value: null},
        "x0020000D": { action: "replace", value: null},
        "x00080016": { action: "copy", value: null},
        "x00080018": { action: "replace", value: null},
        "x00080060": { action: "copy", value: null},
        "x00080008": { action: "copy", value: null},
        "x0020000E": { action: "replace", value: null},
        "x00200052": { action: "replace", value: null},
        "x00280030": { action: "copy", value: null},
        "x00200037": { action: "copy", value: null},
        "x00200032": { action: "copy", value: null},
        "x00280002": { action: "copy", value: null},
        "x00280010": { action: "copy", value: null},
        "x00280011": { action: "copy", value: null},
        "x00280103": { action: "copy", value: null},
        "x7FE00010": { action: "copy", value: null},
    }
}
