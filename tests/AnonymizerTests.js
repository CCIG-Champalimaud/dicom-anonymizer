

const fs = require('fs-extra')
const path = require('path')
const DicomAnonymizer = require('../src/DicomAnonymizer.js')
const dicomAnonymizer = new DicomAnonymizer()


module.exports = class DicomAnonymizerTests {
    files = []

    addDicomFiles(files){
        this.files.push(...files)
    }




    async checkIfFileIsDicomP10(){
        const arraybuffer = fs.readFileSync(this.files[0])
        const isDicom =  await dicomAnonymizer.checkIfArraybufferIsDicomP10(arraybuffer)
        console.log('is dicom?', isDicom)
    }




    setConfig(config = 0){
        dicomAnonymizer.setConfig(config) //'0', 'blacklist'
        console.log(dicomAnonymizer.config.name) //test if config is ok instead of this
    }




    async getDatasetFromFile(){
        const ds = await dicomAnonymizer.getDatasetFromFile(this.files[0])
        console.log(ds.x00100010.value[0], ds.x00100020.value[0], ds.x00100030.value[0])
    }







    isPrivateTag(){
        
        const tags = ['(0010,20FF)', '(0019,202A)', '(2002,1014)', '(2001,00FF)', '(7FE0,0010)']
       
        for(const tag of tags){
            console.log(tag, dicomAnonymizer.isPrivateTag(tag))
        }
    }






    //check if tag is present in the given list (match wildcards 'x')
    tagIsInList(){
        const tags = ['(0010,20FF)', '(0010,202A)', '(5010,1014)', '(7AF0,00FF)']
        const list = ['(0110,202A)', '(5x1x,xxxx)', '(xAFx,0xxF)', '(0010,20FF)']
        console.log(list)
        for(const tag of tags){
            console.log(tag, dicomAnonymizer.tagIsInList(tag, list))
        }
    }






    isKnownClass(){
        console.log(dicomAnonymizer.isKnownClass('1.2.840.100082.123145.0980123'))
        console.log(dicomAnonymizer.isKnownClass('1001.1.2.840.10008.100'))
    }






    //convert a string to number
    hashStringToNumber(){
        console.log(dicomAnonymizer.hashStringToNumber('this is a test string'))
        console.log(dicomAnonymizer.hashStringToNumber('1001.1.2.840.10008.100.12463562312341568'))
    }







    tagFormat(tagAddress, format='x'){ 
        console.log('x10102020', dicomAnonymizer.tagFormat('x10102020', 'p'))
        console.log('(0018,201F)', dicomAnonymizer.tagFormat('(0018,201F)', 'x'))
    }





    
    
    
    async previewAnonymizeFileAsDatatable(){
        const arraybuffer = fs.readFileSync(this.files[0]).buffer
        const prev = await dicomAnonymizer.previewAnonymizeArraybufferAsDatatable(arraybuffer)
        console.log(prev)
       //console.log(prev.find(p=>p.address === '(0010,0010)').value, '=>', prev.find(p=>p.address === '(0010,0010)').valueAfter)
       //console.log(prev.find(p=>p.address === '(0010,0020)').value, '=>', prev.find(p=>p.address === '(0010,0020)').valueAfter)
    }







    async anonymizeFile(file, mapKeys = []){
        console.log('**', file, '**')

        const arraybuffer = fs.readFileSync(file)
        //const blob = await dicomAnonymizer.anonymizeArraybuffer(arraybuffer, mapKeys)
        const prev = await dicomAnonymizer.previewAnonymizeArraybufferAsDatatable(arraybuffer)
        
        
        console.log(prev.filter(t=>{return t.address === '(0012,0063)' || t.address === '(0012,0064)' || t.address === '(0002,0012)' || t.address === '(0002,0013)'}))
        //console.log(prev)
        //console.log(mapKeys)
    }

    
    


    async anonymizeFiles(mapKeys = []){
        for(const file of this.files){
            console.log('**', file, '**')
            const arraybuffer = fs.readFileSync(file)
            const blob = await dicomAnonymizer.anonymizeArraybuffer(arraybuffer, mapKeys)
            const prev = await dicomAnonymizer.previewAnonymizeArraybufferAsDatatable(blob)
            console.log(prev.filter(t=>{return t.address === '(0012,0063)' || t.address === '(0012,0064)' || t.address === '(0002,0012)' || t.address === '(0002,0013)'}))
        }

    }

}
