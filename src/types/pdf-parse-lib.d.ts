// Diz ao TS que o módulo interno reexporta o default do pacote principal
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
