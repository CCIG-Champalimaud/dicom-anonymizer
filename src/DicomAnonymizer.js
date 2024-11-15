const pck = require('../package.json')
const versionString = pck.version.replaceAll('.', '_')
const dwv = require('dwv')
const blacklistConfig = require('./protocols/blacklistConfig.json')
const whitelistConfig = require('./protocols/whitelistConfig.json')
const dicomMandatoryTags = require('./utils/dicomMandatoryTags.js')
const namesDictionary = require('./utils/namesDictionary.js')
const dicomTagDictionary = require('./utils/dicomTagDictionary.js')
const objHash = require('object-hash')


module.exports = class DicomAnonymizer {
    
    version = pck.version
    description = pck.description
    
    //default values
    defaultConfigs = {
        blacklist: blacklistConfig,
        whitelist: whitelistConfig
    }
    config = blacklistConfig //blacklist configuration is default
    dicomImplementationClassUID = '1.2.826.0.1.3680043.10.669.1.01' //last 2 digits are software version
    dicomImplementationVersionName = `CLINITI_ANONYMIZER_${versionString}`
    deidentificationMethod = `cliniti-blacklist`
    dicomUIDPrefix = '1.2.826.0.1.3680043.10.669.2'



    constructor(configObject = {}){
        if( configObject && Object.keys(configObject).length ){
            //set implementation class UID, version and prefix (or default if missing)
            const {dicomImplementationClassUID, dicomImplementationVersionName, dicomUIDPrefix, deidentificationMethod, configuration } = configObject
            if(configuration) this.config = configuration
            if(dicomImplementationClassUID) this.dicomImplementationClassUID = dicomImplementationClassUID
            if(deidentificationMethod) this.deidentificationMethod = deidentificationMethod
            if(dicomImplementationVersionName) this.dicomImplementationVersionName = dicomImplementationVersionName
            if(dicomUIDPrefix) this.dicomUIDPrefix = dicomUIDPrefix
        }

        this.dwvDicomParser = new dwv.dicom.DicomParser()
        this.dwvDicomWriter = new dwv.dicom.DicomWriter()

        //this is my custom version of getBuffer to overwrite some header elements
        this.dwvDicomWriter.getBuffer = function (dicomElements) {
            // Transfer Syntax
            var syntax = dwv.dicom.cleanString(dicomElements.x00020010.value[0]);
            var isImplicit = dwv.dicom.isImplicitTransferSyntax(syntax);
            var isBigEndian = dwv.dicom.isBigEndianTransferSyntax(syntax);
            // Specific CharacterSet
            if (typeof dicomElements.x00080005 !== 'undefined') {
              var oldscs = dwv.dicom.cleanString(dicomElements.x00080005.value[0]);
              // force UTF-8 if not default character set
              if (typeof oldscs !== 'undefined' && oldscs !== 'ISO-IR 6') {
                dwv.logger.debug('Change charset to UTF, was: ' + oldscs);
                this.useSpecialTextEncoder();
                dicomElements.x00080005.value = ['ISO_IR 192'];
              }
            }
            // Bits Allocated (for image data)
            var bitsAllocated;
            if (typeof dicomElements.x00280100 !== 'undefined') {
              bitsAllocated = dicomElements.x00280100.value[0];
            }
          
            // calculate buffer size and split elements (meta and non meta)
            var totalSize = 128 + 4; // DICM
            var localSize = 0;
            var metaElements = [];
            var rawElements = [];
            var element;
            var groupName;
            var metaLength = 0;
            // FileMetaInformationGroupLength
            var fmiglTag = dwv.dicom.getFileMetaInformationGroupLengthTag();
            // FileMetaInformationVersion
            var fmivTag = new dwv.dicom.Tag('0x0002', '0x0001');
            // ImplementationClassUID
            var icUIDTag = new dwv.dicom.Tag('0x0002', '0x0012');
            // ImplementationVersionName
            var ivnTag = new dwv.dicom.Tag('0x0002', '0x0013');
          
            // loop through elements to get the buffer size
            var keys = Object.keys(dicomElements);
            for (var i = 0, leni = keys.length; i < leni; ++i) {
              element = this.getElementToWrite(dicomElements[keys[i]]);
              if (element !== null &&
                 !fmiglTag.equals(element.tag) &&
                 !fmivTag.equals(element.tag) ){//&&
                 //!icUIDTag.equals(element.tag) &&
                 //!ivnTag.equals(element.tag)) {
                localSize = 0;
          
                // XB7 2020-04-17
                // Check if UN can be converted to correct VR.
                // This check must be done BEFORE calculating totalSize,
                // otherwise there may be extra null bytes at the end of the file
                // (dcmdump may crash because of these bytes)
                dwv.dicom.checkUnknownVR(element);
          
                // update value and vl
                this.setElementValue(
                  element, element.value, isImplicit, bitsAllocated);
          
                // tag group name
                groupName = element.tag.getGroupName();
          
                // prefix
                if (groupName === 'Meta Element') {
                  localSize += dwv.dicom.getDataElementPrefixByteSize(element.vr, false);
                } else {
                  localSize += dwv.dicom.getDataElementPrefixByteSize(
                    element.vr, isImplicit);
                }
          
                // value
                localSize += element.vl;
          
                // sort elements
                if (groupName === 'Meta Element') {
                  metaElements.push(element);
                  metaLength += localSize;
                } else {
                  rawElements.push(element);
                }
          
                // add to total size
                totalSize += localSize;
              }
            }
          
            // FileMetaInformationVersion
            var fmiv = dwv.dicom.getDicomElement('FileMetaInformationVersion');
            var fmivSize = dwv.dicom.getDataElementPrefixByteSize(fmiv.vr, false);
            fmivSize += this.setElementValue(fmiv, [0, 1], false);
            metaElements.push(fmiv);
            metaLength += fmivSize;
            totalSize += fmivSize;
            // ImplementationClassUID
            var icUID = dwv.dicom.getDicomElement('ImplementationClassUID');
            var icUIDSize = dwv.dicom.getDataElementPrefixByteSize(icUID.vr, false);
            
            var icUIDValue = (dicomElements.x00020012 && dicomElements.x00020012.value && dicomElements.x00020012.value.length) ?
                String.fromCharCode.apply(null, dicomElements.x00020012.value) :
                dwv.dicom.getUID('ImplementationClassUID') 
            icUIDSize += this.setElementValue(
                icUID, [icUIDValue], false);
            metaElements.push(icUID);
            metaLength += icUIDSize;
            totalSize += icUIDSize;
            // ImplementationVersionName
            var ivn = dwv.dicom.getDicomElement('ImplementationVersionName');
            var ivnSize = dwv.dicom.getDataElementPrefixByteSize(ivn.vr, false);
            //var ivnValue = 'DWV_' + dwv.getVersion();
            var ivnValue = (dicomElements.x00020013 && dicomElements.x00020013.value && dicomElements.x00020013.value.length) ?
                String.fromCharCode.apply(null, dicomElements.x00020013.value) :
                this.dicomImplementationVersionName
            ivnSize += this.setElementValue(ivn, [ivnValue], false);
            metaElements.push(ivn);
            metaLength += ivnSize;
            totalSize += ivnSize;
          
            // sort elements
            var elemSortFunc = function (a, b) {
              return dwv.dicom.tagCompareFunction(a.tag, b.tag);
            };
            metaElements.sort(elemSortFunc);
            rawElements.sort(elemSortFunc);
          
            // create the FileMetaInformationGroupLength element
            var fmigl = dwv.dicom.getDicomElement('FileMetaInformationGroupLength');
            var fmiglSize = dwv.dicom.getDataElementPrefixByteSize(fmigl.vr, false);
            fmiglSize += this.setElementValue(
              fmigl, new Uint32Array([metaLength]), false);
            totalSize += fmiglSize;
          
            // create buffer
            var buffer = new ArrayBuffer(totalSize);
            var metaWriter = new dwv.dicom.DataWriter(buffer);
            var dataWriter = new dwv.dicom.DataWriter(buffer, !isBigEndian);
          
            var offset = 128;
            // DICM
            offset = metaWriter.writeUint8Array(offset, this.encodeString('DICM'));
            // FileMetaInformationGroupLength
            offset = this.writeDataElement(metaWriter, fmigl, offset, false);
            // write meta
            for (var j = 0, lenj = metaElements.length; j < lenj; ++j) {
              offset = this.writeDataElement(metaWriter, metaElements[j], offset, false);
            }
          
            // check meta position
            var preambleSize = 128 + 4;
            var metaOffset = preambleSize + fmiglSize + metaLength;
            if (offset !== metaOffset) {
              dwv.logger.warn('Bad size calculation... meta offset: ' + offset +
                ', calculated size:' + metaOffset +
                ' (diff:' + (offset - metaOffset) + ')');
            }
          
            // pass flag to writer
            dataWriter.useUnVrForPrivateSq = this.useUnVrForPrivateSq;
            // write non meta
            for (var k = 0, lenk = rawElements.length; k < lenk; ++k) {
              offset = this.writeDataElement(
                dataWriter, rawElements[k], offset, isImplicit);
            }
          
            // check final position
            if (offset !== totalSize) {
              dwv.logger.warn('Bad size calculation... final offset: ' + offset +
                ', calculated size:' + totalSize +
                ' (diff:' + (offset - totalSize) + ')');
            }
            // return
            return buffer;
          };
          
    }





    setConfig(newConfig){
        if(typeof newConfig === 'object'){
            this.config = newConfig
        
        }else{
            if(newConfig === 0 || newConfig === '0' || newConfig.toString().toLowerCase() === 'blacklist'){
                this.config = this.defaultConfigs.blacklist 
            
            }else if(newConfig === 1 || newConfig === '1' || newConfig.toString().toLowerCase() === 'whitelist'){
                this.config = this.defaultConfigs.whitelist 
               
            }else{
                console.log('config not found')
            }
        }

    }




    /**
    * 
    * @param {File} file 
    */
    async getDatasetFromFile(file){
    
        const parseDicom = (f)=>{
            return new Promise((resolve, reject) => {
                try{
    
                    const   reader = new FileReader(),
                            dicomParser = new dwv.dicom.DicomParser()
    
                    reader.onload = function() {
                        const arrayBuffer = new Uint8Array(reader.result)
                        dicomParser.parse(arrayBuffer.buffer)
                        resolve(dicomParser.getRawDicomElements())
                    }
                    reader.readAsArrayBuffer(f) 
    
                }catch(ex){
                    reject(ex) 
                }
            }) 
        }
            
        return await parseDicom(file)
        
    }







    async getDatasetFromArraybuffer(arraybuffer){
        const dicomParser = new dwv.dicom.DicomParser()
        dicomParser.parse(arraybuffer.buffer)
        return dicomParser.getRawDicomElements()
    }


    




    
    async previewAnonymizeFileAsDatatable(file){
        const rawTags = await this.getDatasetFromFile(file)
        return this.#previewAnonymizer(rawTags)
    }


    async previewAnonymizeArraybufferAsDatatable(arraybuffer){
        const rawTags = await this.getDatasetFromArraybuffer(arraybuffer)
        return this.#previewAnonymizer(rawTags)
    }




    async anonymizeFile(file, mapKeys = [], anonymizedProps = []){ 
        const rawTags = await this.getDatasetFromFile(file)
        //setup properties to process the tags
        const processTagsConfig = this.#initProcessConfig(rawTags, mapKeys) // returns {imageProps, isImplicit, strategy, options, customActionList, rules}
        //in case the parent function needs the new imageProps (to build a filepath for example)
        anonymizedProps.push( processTagsConfig.imageProps)
        //copy, remove and modify tags
        this.#processTags(rawTags, processTagsConfig)
        //use dwv writer to create a new file with the modified tags
        return this.#writeTagsToBlob(rawTags, processTagsConfig.rules)
    }



    async anonymizeArraybuffer(arraybuffer, mapKeys = [], anonymizedProps = []){ 
        const rawTags = await this.getDatasetFromArraybuffer(arraybuffer)
        //setup properties to process the tags
        const processTagsConfig = this.#initProcessConfig(rawTags, mapKeys) // returns {imageProps, isImplicit, strategy, options, customActionList, rules}
        //in case the parent function needs the new imageProps (to build a filepath for example)
        anonymizedProps.push( processTagsConfig.imageProps)
        //copy, remove and modify tags
        this.#processTags(rawTags, processTagsConfig)
        //use dwv writer to create a new file with the modified tags
        return this.#writeTagsToArrayBuffer(rawTags, processTagsConfig.rules)
    }





    isPrivateTag(tagAddress){
        // Extract the group number from the tag address string
        const groupNumber = tagAddress.substring(1, 5)
        // Convert the group number from hexadecimal to decimal
        const decimalGroupNumber = parseInt(groupNumber, 16)
        // Check if the group number is odd
        return decimalGroupNumber % 2 !== 0
    }






    //check if tag is present in the given list (match wildcards 'x')
    tagIsInList(tag, list){
        const self = this
        //direct search
        let found = list.includes(tag)
    
        //search in tags with wildcard 'x'
        if(!found){
    
            for( let key of list){
            
                if(key.indexOf('x') >= 0 ){
                    let pattern = key.replaceAll('x','[0-9A-Fa-f]{1}')
                    pattern = pattern.replace('(','\(')
                    pattern = pattern.replace(')','\)')
                    const reg = new RegExp(pattern)
                    
                    if( reg.test(tag) ){
                        found = true
                        break;
                    }
                }
            }
        }

        return found
    }






    isKnownClass(uid){
        //all known class uid's start with same value (they are 1760 or more so no need to check all)
        return uid.substring(0, 13) == '1.2.840.10008'
    }






    //convert a string to number
    hashStringToNumber(str){
        return this.#cyrb53(str,0)
    }







    //convert between tag formats x00100020 , (0010,0020)
    tagFormat(tagAddress, format='x'){ //format x = x00100020, p = (0010,0020)
        //from (0010,0020) to x00100020
        if(format === 'x' && tagAddress[0] !== 'x'){
            return `x${tagAddress.substring(1,5)}${tagAddress.substring(6,10)})`

        //from x00100020 to (0010,0020)
        }else if(format === 'p' && tagAddress[0] !== '('){
            return `(${tagAddress.substring(1,5)},${tagAddress.substring(5,9)})`
        }
        //unknown or already in the correct format
        return tagAddress
    }





    


    

    async checkIfFileIsDicomP10(file) {
        const chunkSize  = 4
        const offset     = 128

        
        const checkFile = (f)=>{
            return new Promise((resolve, reject) => {
                try{
    
                    const reader = new FileReader()
    
                    reader.onload = function() {
                        
                        const arrayBuffer = new Uint8Array(reader.result)
                        
                        const labelByte = arrayBuffer.reduce( (prev, cur) => prev + String.fromCharCode(cur),'')
                        
                        resolve(labelByte === 'DICM')
                    }
                    const slicedFile = f.slice(offset, offset + chunkSize)

                    reader.readAsArrayBuffer(slicedFile)
    
                }catch(ex){
                    resolve(false) 
                }
            }) 
        }
        
        return await checkFile(file)
    }
    
    
    








    checkIfArraybufferIsDicomP10(arraybuffer) {
        const chunkSize  = 4
        const offset     = 128
        const slicedBuffer = arraybuffer.slice(offset, offset + chunkSize)
        const labelByte = slicedBuffer.reduce( (prev, cur) => prev + String.fromCharCode(cur),'')   
        return(labelByte === 'DICM')
    }






















    //PRIVATE METHODS ==========================
    //convertDatasetToDatatable
    #previewAnonymizer(rawTags){

        //patientID
        const newPatientID = this.#convertPatientId(rawTags.x00100020.value[0]) //11 char string
        
        const {options} = this.config.protocol

        //patient name
        const oldPatientName = rawTags.x00100010.value[0] || rawTags.x00100020.value[0]
        const newPatientName = this.#convertPatientName(
            oldPatientName,
            newPatientID,
            options.patientNameOption,
            options.patientNamePrefix,
            options.patientNameSuffix
        )

        const imageProps = {
            PatientName: newPatientName,
            PatientID: newPatientID
        }

        const syntax = dwv.dicom.cleanString(rawTags.x00020010.value[0])
        const isImplicit = dwv.dicom.isImplicitTransferSyntax(syntax)

        //create a table to write the tag address, name, value before and after anonymization
        let datatable = []
        
        this.#previewProcessTags(rawTags, false, false, '', imageProps, datatable)
        //return the table outlining the preview of the anonymization process
        return datatable
    }







    #previewProcessTags(tagsObj, sequence, remove, pad, imageProps, datatable){
        const {strategy, options} = this.config.protocol
        const customActionList = this.config.protocol[strategy] || []
        
        for(const [tagAddress, tag] of Object.entries(tagsObj)){

            //convert address from x12341234 to (1234,1234)
            const tagFromDic = this.#getTag(tagAddress)
            const look = tagFromDic.tag
            const lookName = tagFromDic.name

            const row = {address: `${pad}${look}`, name: lookName}
            


            if(tagAddress === 'x00020012' ){ 
                row.action = 'replace'
                row.value = this.#getElementValueAsString(tag)
                row.valueAfter = this.dicomImplementationClassUID
                datatable.push(row)
                continue
            }
            if(tagAddress === 'x00020013'){
                row.action = 'replace'
                row.value = this.#getElementValueAsString(tag)
                row.valueAfter = this.dicomImplementationVersionName
                datatable.push(row)
                continue
            }
            if(tagAddress === 'x00120063'){
                row.action = 'replace'
                row.value = this.#getElementValueAsString(tag)
                row.valueAfter = this.deidentificationMethod
                datatable.push(row)
                continue
            }
            if(tagAddress === 'x00120064'){
                row.value = ''
                row.valueAfter = ''
                datatable.push(row)

                for(let k of Object.keys(tag.value) ){
                    this.#previewProcessTags(tag.value[k], true, true,`  ${pad}`, imageProps, datatable)
                }
                
                continue
            }



            //default action for whitelist is remove (when not listed) and copy for blacklist (when not listed)
            let tagAction = strategy === 'whitelist' ? 'remove' : 'copy'

            //blacklist has some additional options that only make sense in a blacklist cenario
            //private groups
            if( strategy === 'blacklist' && options.removePrivateGroups && this.isPrivateTag(tagAddress) ){
                tagAction = 'remove'
            }
            //curve tags 50xx
            if( strategy === 'blacklist' && options.removeCurves && tagAddress.startsWith('x50') ){
                tagAction = 'remove'
            }
            //overlay tags 60xx
            if( strategy === 'blacklist' && options.removeOverlays && tagAddress.startsWith('x60') ){
                tagAction = 'remove'
            }

            //keep Group 0018
            if( strategy === 'whitelist' && options.keepGroup0018 && tagAddress.startsWith('x0018') ){
                tagAction = 'copy'
            }

            //keep Group 0020
            if( strategy === 'whitelist' && options.keepGroup0020 && tagAddress.startsWith('x0020') ){
                tagAction = 'copy'
            }

            //keep Group 0028
            if( strategy === 'whitelist' && options.keepGroup0028 && tagAddress.startsWith('x0028') ){
                tagAction = 'copy'
            }




            //if tag was found in whitelist then allow ('copy'), if list is blacklist then remove
            if( this.tagIsInList(look, customActionList) ){
                tagAction = strategy === 'whitelist' ? 'copy' : 'remove'
            }
            
            // Exceptions - if tag is in exceptions, reverse the normal strategy tag action
            if( options.exceptions && this.tagIsInList(look, options.exceptions) ){
                tagAction =  strategy === 'whitelist' ? 'remove' : 'copy'
            }


            //mandatory tags overide user lists
            const mandatory = dicomMandatoryTags.general
            let mandatoryValue = null
            
            if(mandatory[tagAddress]){
                tagAction = mandatory[tagAddress].action

                if(tagAddress === 'x00100010'){//patient name
                    mandatoryValue = imageProps.PatientName
                
                } else if(tagAddress === 'x00100020'){//patient ID
                    mandatoryValue = imageProps.PatientID
            
                } else if(tagAddress === 'x00100030'){//patient birth date
                    mandatoryValue = this.#convertPatientBirthDate(tag.value[0], options.keepPatientBirthYear)
                } 
            }

            //marked in parent SQ to remove so all child tags are removed also
            if(remove) tagAction = 'remove'


            row.action = tagAction


            //ex. patientID
            if(tagAction === 'replace' && mandatoryValue && tag.vr !== 'SQ'){
                row.value = this.#getElementValueAsString(tag) 
                tag.value[0] = this.#padElementValue(tag, mandatoryValue ) 
                row.valueAfter = this.#getElementValueAsString(tag)
                datatable.push(row)
                continue
            }



            //sequence items need special treatment
            if(tag.vr === 'SQ'){
                row.value = ''
                row.valueAfter = ''
                datatable.push(row)

                for(let k of Object.keys(tag.value) ){
                    this.#previewProcessTags(tag.value[k], true, tagAction === 'remove',`  ${pad}`, imageProps, datatable)
                }
                
                continue
            }

            //just remove it and continue
            if( tagAction === 'remove'){
                row.value = this.#getElementValueAsString(tag)
                row.valueAfter = ''
                datatable.push(row)
                continue
            }
            
            if(tag.vr === 'UI' && tag.value[0].length){
                const ui = this.#getElementValueAsString(tag) //tag.value[0].replace(/\0/g, '') //remove null characters
                
                row.value = ui
                if( !this.isKnownClass(ui)){
                    tag.value[0] = this.#padElementValue(tag, this.#convertUID(ui))
                    row.action = 'replace'
                }
                row.valueAfter = this.#getElementValueAsString(tag)
                
                datatable.push(row)
                continue
            }


            //else is copy

            row.value = this.#getElementValueAsString(tag)
            row.valueAfter = row.value
            datatable.push(row)
        }


    
    }










    #initProcessConfig(rawTags, map){
    
        const {strategy, options} = this.config.protocol
        const customActionList = this.config.protocol[strategy] || []
    
        //patientID
        const oldPatientID = this.#getElementValueAsString(rawTags.x00100020)
        const newPatientID = this.#convertPatientId(oldPatientID)
        
        //patient name
        const oldPatientName = this.#getElementValueAsString(rawTags.x00100010) || this.#getElementValueAsString(rawTags.x00100020) 
        const newPatientName = this.#convertPatientName( oldPatientName, newPatientID, options.patientNameOption, options.patientNamePrefix, options.patientNameSuffix )
        
        //patient age
        const patientAge = this.#getElementValueAsString(rawTags.x00101010) || ''

        //patient birth date
        const patientBirthdate = this.#getElementValueAsString(rawTags.x00100030) || ''

        //institution name
        const institutionName = this.#getElementValueAsString(rawTags.x00080080) || ''

        //study date
        const studyDate = this.#getElementValueAsString(rawTags.x00080020) || ''

        //study instance UID
        const oldStudyInstanceUID = this.#getElementValueAsString(rawTags['x0020000D']) || ''
        const newStudyInstanceUID = this.#convertUID( oldStudyInstanceUID )
    
        //series instance UID
        const oldSeriesInstanceUID = this.#getElementValueAsString(rawTags['x0020000E']) || ''
        const newSeriesInstanceUID = this.#convertUID( oldSeriesInstanceUID )
    
        //SOP Instance UID
        const oldSOPInstanceUID = this.#getElementValueAsString(rawTags.x00020003) || this.#getElementValueAsString(rawTags.x00080018) 
        const newSOPInstanceUID = this.#convertUID( oldSOPInstanceUID )
        
        const imageProps = {
            PatientName: newPatientName,
            PatientID: newPatientID,
            StudyInstanceUID: newStudyInstanceUID,
            SeriesInstanceUID: newSeriesInstanceUID,
            SOPInstanceUID: newSOPInstanceUID,
        }
    
        if(map) {
            this.#updateMap(map, {
                oldPatientName,
                oldPatientID,
                patientAge,
                patientBirthdate,
                studyDate,
                institutionName,
                oldStudyInstanceUID,
                oldSeriesInstanceUID,
                newPatientName,
                newPatientID,
                newStudyInstanceUID,
                newSeriesInstanceUID
            })
        }
    
        const syntax = dwv.dicom.cleanString(rawTags.x00020010.value[0])
        const isImplicit = dwv.dicom.isImplicitTransferSyntax(syntax)
    
        const rules = { //actions: copy, clean, remove, replace
            default: {
                action: 'copy', //has to be copy otherwise the getBuffer will remove everything, defaultAction is taken care of in processTags function
                value: null
            },
            'x00020003': {action: 'replace', value: newPatientID },
            'x00020010': {action: 'copy', value: null},
            'x00020016': {action: 'remove', value: null},
            'x00020100': {action: 'remove', value: null},
            'x00020102': {action: 'remove', value: null},
            // 'x00120063': {action: 'replace', value: this.deidentificationMethod},
            // 'x00120064': {action: 'replace', value: ''},
            'x101807A3': {action: 'copy', value: null} //??
        }
        
        return {imageProps, isImplicit, strategy, options, customActionList, rules}
    }
    
    










    #processTags(rawTags, processTagsConfig, isSequence = false){ 

        const {imageProps, isImplicit, strategy, options, customActionList} = processTagsConfig
        
        for(const [tagAddress, tag] of Object.entries(rawTags)){
            //leave header tags, already taken care off
            //const groupName = dwv.dicom.TagGroups[tag.tag.getGroup().slice(1)];

            // if (groupName === 'Meta Element') {
            //     //continue
            // }
            
            if(tagAddress === 'x00020012' ){ 
                tag.value[0] = this.#padElementValue(tag, this.dicomImplementationClassUID ) 
                tag.vl = tag.value[0].length;
                tag.endOffset = tag.startOffset + tag.value[0].length
                continue
            }
            if(tagAddress === 'x00020013'){
                tag.value[0] = this.#padElementValue(tag, this.dicomImplementationVersionName ) 
                tag.vl = tag.value[0].length;
                tag.endOffset = tag.startOffset + tag.value[0].length
                continue
            }
            if(tagAddress === 'x00120063'){
                tag.value[0] = this.#padElementValue(tag, this.deidentificationMethod ) 
                tag.vl = tag.value[0].length;
                tag.endOffset = tag.startOffset + tag.value[0].length
                continue
            }
            if(tagAddress === 'x00120064'){ 
                delete rawTags[tagAddress]
                continue
            }




            //convert address from x12341234 to (1234,1234)
            const look = this.tagFormat(tagAddress, 'p')

            
            //default action for whitelist is remove (when not listed) and copy for blacklist (when not listed)
            let tagAction = strategy === 'whitelist' ? 'remove' : 'copy'
    
    
            //blacklist has some additional options that only make sense in a blacklist cenario
            //private groups
            if( strategy === 'blacklist' && options.removePrivateGroups && this.isPrivateTag(tagAddress) ){
                tagAction = 'remove'
            }
            //curve tags 50xx
            if( strategy === 'blacklist' && options.removeCurves && tagAddress.startsWith('x50') ){
                tagAction = 'remove'
            }
            //overlay tags 60xx
            if( strategy === 'blacklist' && options.removeOverlays && tagAddress.startsWith('x60') ){
                tagAction = 'remove'
            }
            
            //keep Group 0018
            if( strategy === 'whitelist' && options.keepGroup0018 && tagAddress.startsWith('x0018') ){
                tagAction = 'copy'
            }

            //keep Group 0020
            if( strategy === 'whitelist' && options.keepGroup0020 && tagAddress.startsWith('x0020') ){
                tagAction = 'copy'
            }

            //keep Group 0028
            if( strategy === 'whitelist' && options.keepGroup0028 && tagAddress.startsWith('x0028') ){
                tagAction = 'copy'
            }
    
            //if tag was found in whitelist then allow ('copy'), if list is blacklist then remove
            if( this.tagIsInList(look, customActionList) ){
                tagAction = strategy === 'whitelist' ? 'copy' : 'remove'
            }
            
            // Exceptions - if tag is in exceptions, reverse the normal strategy tag action
            if( options.exceptions && this.tagIsInList(look, options.exceptions) ){
                tagAction =  strategy === 'whitelist' ? 'remove' : 'copy'
            }
            
            //mandatory tags overide user lists
            const mandatory = dicomMandatoryTags.general
            let mandatoryValue = null
            
            if(mandatory[tagAddress]){
                tagAction = mandatory[tagAddress].action
        
                if(tagAddress === 'x00100010'){//patient name
                    mandatoryValue = imageProps.PatientName
                
                } else if(tagAddress === 'x00100020'){//patient ID
                    mandatoryValue = imageProps.PatientID
            
                } else if(tagAddress === 'x00100030'){//patient birth date
                    mandatoryValue = this.#convertPatientBirthDate(tag.value[0], options.keepPatientBirthYear)
                }
               
            }
        
            //just remove it and continue
            if( tagAction === 'remove'){
                delete rawTags[tagAddress]
                continue
            }
    
        
            //ex. patientID
            if(tagAction === 'replace' && mandatoryValue && tag.vr !== 'SQ'){
                tag.value[0] = this.#padElementValue(tag, mandatoryValue ) 
                tag.vl = tag.value[0].length;
                tag.endOffset = tag.startOffset + tag.value[0].length
                continue
            }
    
    
            //sequence items need special treatment
            if(tag.vr === 'SQ'){
            
                const tagPrefixByteSize = 4 //why 4 ???  //dwv.dicom.getDataElementPrefixByteSize(tag.vr, isImplicit)
                
                let vlSize = 0
        
        
                for(let k of Object.keys(tag.value) ){
                    
                    this.#processTags(tag.value[k], processTagsConfig, true)
                
                    //if the delimiter tag has undefined length means the lenght of the sequence will be inplicit and so an end delimiter tag will be added (+4 bytes)
                    //var implicitLength = tag.value[k].xFFFEE000.vl === 'u/l';
                
                    let itemsLength = 0
        
                    for(const [itemAddress, item] of Object.entries(tag.value[k])){
            
                        const itemPrefixByteSize = dwv.dicom.getDataElementPrefixByteSize(item.vr, isImplicit)//nested sequence or pixeldata is not implicit
            
                        if( itemAddress === 'xFFFEE000' || itemAddress === 'xFFFEE00D' || itemAddress === 'xFFFEE0DD'){
                            continue
                        }
                        
                        itemsLength += itemPrefixByteSize + item.vl
                    }
                    
                    tag.value[k].xFFFEE000.vl = itemsLength
                    tag.value[k].xFFFEE000.endOffset = tag.value[k].xFFFEE000.startOffset + itemsLength
                    
                    //account here for the u/l delimiter tag (+4 bytes)
                    vlSize += itemsLength + tagPrefixByteSize + 4 //(implicitLength ? 4 : 0)
                }
                
                tag.vl = vlSize
                tag.endOffset = tag.startOffset + tag.vl
                
                continue
            }
    
            
    
            //in case of copy, check if it has been flagged to change (to maintain UID consistency)
            if(tag.vr === 'UI' && tag.value[0].length){
                const ui = tag.value[0]//tag.value[0].replace(/\0/g, '') //remove null characters
                
                if( !this.isKnownClass(ui) ){
                    tag.value[0] = this.#padElementValue(tag, this.#convertUID(ui))  
                }
                
                tag.vl = tag.value[0].length;
                tag.endOffset = tag.startOffset + tag.value[0].length
                
                continue
            }
        }


    }








    #padElementValue(element, value){
        if (typeof value !== 'undefined' && typeof value.length !== 'undefined') {
            if (dwv.dicom.isVrToPad(element.vr) && !dwv.dicom.isEven(value.length)) {
                if (value instanceof Array) {
                    value[value.length - 1] += dwv.dicom.getVrPad(element.vr)
                } else {
                    value += dwv.dicom.getVrPad(element.vr)
                }
            }
        }
        return value
    }






    //53bit hash of a string into a 16digit number
    #cyrb53(str, seed = 0){
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    }






    //get a new name based on the hash of the old name following a convertion to array index in the patient name's list
    #convertPatientName(oldName, newPatientID = '', patientNameOption, patientNamePrefix = '', patientNameSuffix = ''){
        let newName = ''
        
        if(patientNameOption === 'id'){
            newName = `${newPatientID}`
        
        }else if(patientNameOption === 'dictionary'){
            
            if(oldName){
                const hash = this.hashStringToNumber(oldName).toString()
                const first = parseInt( hash.slice(0,8) )
                const last = parseInt( hash.slice(8) )
                newName = `${ patientNames.first[ first%patientNames.first.length ]}^${ patientNames.last[ last%patientNames.last.length ]}` 
            }
        }
        //add prefix / suffix
        newName = `${patientNamePrefix}${newName}${patientNameSuffix}`
        
        if(!newName){
            // null for some reason use
            newName = 'anonymized'
        }
        
        return newName
    }






    #convertPatientId(oldId){
        //should not happen because patientID is mandatory for compliance with P10 standard
        if(!oldId){
            return Math.random().toString(36).substring(2, 13)  //11 char string
        }
        return this.hashStringToNumber(oldId).toString(36) //11 char string
    }






    //get a new UID based on the hash of the previous one prefixed by the dicomUIDPrefix
    #convertUID(oldUID){
        //UID empty, generate a new one for uniqueness 
        if(!oldUID){
            return `${this.dicomUIDPrefix}.${this.hashStringToNumber( Math.random().toString(36).substring(2, 11) )}`
        }
        const hash = objHash(oldUID) //40 chars
        const hash1 = this.hashStringToNumber( hash.slice(0,20) )
        const hash2 = this.hashStringToNumber( hash.slice(20) )
        return `${this.dicomUIDPrefix}.${hash1}${hash2}` //60 chars 
    }






    #getElementValueAsString(dicomElement){
        return dwv.dicom.DicomElementsWrapper.prototype.getElementValueAsString(dicomElement)
    }







    //replace birthdate keeping the year for age preservation
    #convertPatientBirthDate(birthDate, keepPatientBirthYear = true){
        if( !birthDate || !keepPatientBirthYear || birthDate.length !== 8){
            return ''
        }
        return `${birthDate.substring(0,4)}0101` 
    }





    //input as x00100020
    #getTag(tagAddress){
        const group = tagAddress.substring(1,5);
        const element = tagAddress.substring(5,9);
        const tagIndex = `(${group},${element})`.toUpperCase();
        const attr = dicomTagDictionary[tagIndex];
        return attr || { tag: tagIndex, name: '' };
    }






    
    #writeTagsToBlob(processedTags, rules){
        //remake the file with the modified tags object
        const writer = this.dwvDicomWriter 
        writer.rules = rules
        const dicomBuffer = writer.getBuffer(processedTags)
        
        return new Blob([dicomBuffer], {type: 'application/dicom'})
    }
    

    #writeTagsToArrayBuffer(processedTags, rules){
        //remake the file with the modified tags object
        const writer = this.dwvDicomWriter
        writer.rules = rules
        const dicomBuffer = writer.getBuffer(processedTags)
        const byteArray = new Uint8Array(dicomBuffer)
        return byteArray 
    }
    
    




    #updateMap(map, data){
        const mapItem = map.find(item => item['oldSeriesId'] === data.oldSeriesInstanceUID)
        if(!mapItem){
            map.push({
                oldPatientName: data.oldPatientName,
                newPatientName: data.newPatientName,
                patientAge: data.patientAge,
                patientBirthdate: data.patientBirthdate,
                studyDate: data.studyDate,
                institutionName: data.institutionName,
                oldPatientId: data.oldPatientID,
                oldStudyId: data.oldStudyInstanceUID,
                oldSeriesId: data.oldSeriesInstanceUID,
                newPatientId: data.newPatientID,
                newStudyId: data.newStudyInstanceUID,
                newSeriesId: data.newSeriesInstanceUID
            })
        }
    }




}