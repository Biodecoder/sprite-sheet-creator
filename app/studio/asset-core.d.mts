export function crc32(data: Uint8Array): number;
export function binaryData(dataUrl: string): Uint8Array;
export function zip(files: {name:string;bytes:Uint8Array}[]): Blob;
export function atlasPositions(count:number,width:number,height:number,maxColumns?:number): {columns:number;rows:number;width:number;height:number;frames:{x:number;y:number;w:number;h:number}[]};
