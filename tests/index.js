const fs = require('fs-extra')
const path = require('path')
const blackListConfig = require('../src/protocols/blacklistConfig.json')
const whiteListConfig = require('../src/protocols/whitelistConfig.json')

const DicomAnonymizerTests = require('./AnonymizerTests.js')
const anonymizerTest = new DicomAnonymizerTests()


const files = getListOfFilesInDirectory( path.join(__dirname, '.', 'files') )

anonymizerTest.setConfig(blackListConfig)



anonymizerTest.addDicomFiles(files)

anonymizerTest.checkIfFileIsDicomP10()

//anonymizerTest.setConfig()
//anonymizerTest.getDatasetFromFile()
//anonymizerTest.isPrivateTag()
//anonymizerTest.tagIsInList()
//anonymizerTest.isKnownClass()
//anonymizerTest.hashStringToNumber()
//anonymizerTest.tagFormat()
anonymizerTest.previewAnonymizeFileAsDatatable()
//anonymizerTest.anonymizeFile(files[1])




function getListOfFilesInDirectory(dir) {
    const files = []
    
    fs.readdirSync(dir).forEach( f => {
        const fullpath = path.join(dir, f)
       
        if (fs.statSync(fullpath).isDirectory()){
            files.push( ...getListOfFilesInDirectory(fullpath) )
        }else{
            files.push(fullpath) 
        }
    })
    
    return files
}

