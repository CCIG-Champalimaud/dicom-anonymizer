

const DicomAnonymizer = require('../src/DicomAnonymizer.js')
const dicomAnonymizer = new DicomAnonymizer()


module.exports = class DicomAnonymizerTests {
    files = []

    addDicomFiles(files){
        this.files.push(...files)
    }




    async checkIfFileIsDicomP10(){
        const isDicom =  await dicomAnonymizer.checkIfFileIsDicomP10(this.files[0])
        console.log('is dicom?', isDicom)
    }




    setConfig(){
        dicomAnonymizer.setConfig(0) //'0', 'blacklist'
        console.log(dicomAnonymizer.config.name) //test if config is ok instead of this
        dicomAnonymizer.setConfig(1) //'1', 'whitelist'
        console.log(dicomAnonymizer.config.name)
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
       const prev = await dicomAnonymizer.previewAnonymizeFileAsDatatable(this.files[0])
       console.log(prev.find(p=>p.address === '(0010,0010)').value, '=>', prev.find(p=>p.address === '(0010,0010)').valueAfter)
       console.log(prev.find(p=>p.address === '(0010,0020)').value, '=>', prev.find(p=>p.address === '(0010,0020)').valueAfter)
    }







    async anonymizeFile(file, mapKeys = []){ 
        const blob = await dicomAnonymizer.anonymizeFile(this.files[0], mapKeys)
        console.log(blob)
        console.log(mapKeys)
    }

    
    

}
