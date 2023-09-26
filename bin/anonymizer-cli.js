#!/usr/bin/env node

const { Command } = require('commander')
const fs = require('fs-extra')
const path = require('path')

//const blackListConfig = require('../src/protocols/blacklistConfig.json')
//const whiteListConfig = require('../src/protocols/whitelistConfig.json')

const DicomAnonymizer = require('../src/DicomAnonymizer.js')
const dicomAnonymizer = new DicomAnonymizer()

const program = new Command();


program
    .name('Anonymizer-Cli')
    .description('CLI to Anonymizer functions')
    .version(dicomAnonymizer.version)


program.command('anonymize')
  .description('anonymize folder')
  .argument('<string>', 'Source folder of files to anonymize')
  .argument('<string>', 'Destination folder of anonymized files')
  .option('--whitelist', 'Use whitelist protocol instead of default blacklist')
  .option('-p, --protocol <string>', 'Path to the custom protocol config file')
  .action(async (source, destination, options) => {
    console.log('----- Anonymize Folder ------')

    const sourcePath = path.normalize(source)
    const destPath = path.normalize(destination)
    
    if(!sourcePath){
        return console.error('ERROR: Source path not valid')
    }

    if(!destPath){
        return console.error('ERROR: Destination path not valid')
    }

    let protocolPath = '../src/protocols/blacklistConfig.json'

    if(options.whitelist){
        protocolPath = '../src/protocols/whitelistConfig.json'
    }
    //custom specified config file will overwrite whitelist option 
    if(options.protocol){
        protocolPath = options.protocol
    }

    let config = null

    try {
        config = require(protocolPath)
    } catch (error) {
        return console.error('ERROR: Custom Protocol is not valid')
    }
    
    console.log('Anonymizer config', config.name, 'is loaded')
    
    let fileList = null
    try {
        fileList = await getAllDicomFilesInDirectory(sourcePath)
    } catch (error) {
        return console.error('ERROR: Path to files is not valid or empty')
    }

    const mapKeys = []
    for(const dicom of fileList){
        const originalName = path.basename(dicom)
        const newName = `anonymized_${originalName}`

        const buf = await readFileAsArrayBuffer(dicom)
        
        const imageProps = []

        const anonymizedByteArray = await dicomAnonymizer.anonymizeArraybuffer(buf, mapKeys, imageProps)

        const directoryPath = path.join(destPath, imageProps[0].PatientID, imageProps[0].StudyInstanceUID, imageProps[0].SeriesInstanceUID)
        
        const fileDestPath = path.join(directoryPath,  newName)

        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }

        fs.writeFileSync(fileDestPath, anonymizedByteArray, {encoding: 'binary'})
        
        console.log(originalName, '->', fileDestPath )
    }
    
    //now write the mapKeys
    const jsonData = JSON.stringify(mapKeys, null, 2)
    
    fs.writeFileSync(path.join(destPath, 'map.json'), jsonData);

})

program.parse()















async function getAllDicomFilesInDirectory(directoryPath) {
    const files = []
  
    async function traverseDir(currentDir) {
      const dirItems = fs.readdirSync(currentDir);
  
      for (const item of dirItems) {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
  
        if (stat.isDirectory()) {
            await traverseDir(itemPath); // Recursively enter subdirectories
        
        } else {
            //check th file is P10 dicom
            const buffer = await readFileAsArrayBuffer(itemPath)

            const isDicom = await dicomAnonymizer.checkIfArraybufferIsDicomP10(buffer)
           
            if( isDicom) files.push(itemPath)
        }
      }
    }
  
    await traverseDir(directoryPath);
    
    return files;
  }










  async function readFileAsArrayBuffer(filePath) {
    try {
      const fileData = await fs.readFile(filePath)
      const arrayBuffer = Buffer.from(fileData)
      return arrayBuffer;
    } catch (error) {
      throw error;
    }
  }