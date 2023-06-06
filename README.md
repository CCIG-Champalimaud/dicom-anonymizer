# DICOM Anonymizer

The DICOM Anonymizer is a tool designed to remove personal patient information details and non-relevant data from medical image DICOM P10 files. It utilizes a deterministic and non-reversible hashing algorithm to modify UIDs, patient ID, and names. The hashing algorithm ensures high collision resistance, producing the same values for the same input, which avoids duplication of images and inconsistent referenced sequences.

## Features

- Anonymizes DICOM P10 files by removing personal patient information and non-relevant data.
- Utilizes a deterministic and non-reversible hashing algorithm for modifying UIDs, patient ID, and names.
- High collision resistance ensures consistency and avoids duplication of images and inconsistent referenced sequences.
- Along with the annymization files, an array can be provided to the "anonymizeFile" function which will be filled with a map referencing the old and new ID's so that the user can trace where the anonymized files came from. If not needed just omit the second argument in the "anonymizeFile" function

## Installation

You can install the DICOM Anonymizer via npm:

```bash
npm install dicom-anonymizer
```

or clone the project from github

xxxx 

and build a distribution bundle with

```
npm run build
```

or

```
yarn build
```


## Usage

### Node.js

To use the DICOM Anonymizer, you need to create an instance of the DicomAnonymizer class by passing a configuration object:

```javascript
const { DicomAnonymizer } = require('dicom-anonymizer');

const config = {
  dicomImplementationClassUID: 'YOUR_IMPLEMENTATION_CLASS_UID',
  dicomImplementationVersionName: 'YOUR_IMPLEMENTATION_VERSION_NAME',
  dicomUIDPrefix: 'YOUR_UID_PREFIX',
  configuration: {
    // Additional configuration options and scripting rules for the anonymization process
    // check src/protocols for blacklist and whitelist aproach and modify it according to needs
  }
    
};

const anonymizer = new DicomAnonymizer(config);
// Check if a file is a DICOM P10 file
const isDicomP10 = await anonymizer.checkIfFileIsDicomP10('path/to/dicom/file.dcm');

// Get the DICOM dataset from a file
const dataset = await anonymizer.getDatasetFromFile('path/to/dicom/file.dcm');

// Preview the anonymization changes as a datatable
const previewTable = await anonymizer.previewAnonymizeFileAsDatatable('path/to/dicom/file.dcm');

// Anonymize the DICOM file
const blob = await anonymizer.anonymizeFile('path/to/dicom/file.dcm'); //optionally pass an array reference as 2nd argument to keep track of the old -> new ID's for each Series

//blob can then be saved somewhere with fs for example
const buffer = Buffer.from( await blob.arrayBuffer() );
fs.writeFileSync('anonymized.dcm', buffer);
}
```

### Browser
after building the project, the dist/ folder will contain dicom-anonymizer.js bundle to include in you html
just add it to the <head> tag of your index.html <script defer="defer" src="dicom-anonymizer.js"></script>
and then use it later on a script like the following:

```javascript
async function start(){
    //initialize instance of anonymizer
    const dicomAnonymizer = new DicomAnonymizer()
    
    //get the file added in input
    const selectedFile = document.getElementById("dicomFileInput").files[0];
    if(!selectedFile) {
        return console.warn('no file found')
    }
    //test if it is a dicom P10 or not
    const checkIsDicom = await dicomAnonymizer.checkIfFileIsDicomP10(selectedFile)
    if(!checkIsDicom) {
        return console.warn('not dicom file')
    }

    //read and parse dicom file
    const ds = await dicomAnonymizer.getDatasetFromFile(selectedFile)
    
    //load configuration (default is blacklist)
    dicomAnonymizer.setConfig('whitelist')

    //anonymize the file
    const map = []
    const blob = await dicomAnonymizer.anonymizeFile(selectedFile, map)
    console.log(map)
    downloadBlob(blob)
}




function downloadBlob(blob){
    const a = document.createElement("a")
    document.body.appendChild(a)
    a.style = "display: none"
    const url = window.URL.createObjectURL(blob)
    a.href = url
    a.download = "anonymized.dcm"
    a.click()
    window.URL.revokeObjectURL(url)
}

```

## Contributing
Contributions are welcome! Please use GitHub issues and/or pull requests. We'll be happy to assist you!

## License
This project is licensed under the MIT License