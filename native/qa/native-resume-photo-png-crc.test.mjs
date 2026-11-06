import test from 'node:test';
import assert from 'node:assert/strict';
import { pngChunkCrcValid } from '../src/lib/resumePhotoPngCrc.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC','base64');
function offsets(bytes) {
  const result=[];
  for (let at=8; at+12<=bytes.length;) {
    const length=bytes.readUInt32BE(at);
    result.push({at,length,type:bytes.toString('ascii',at+4,at+8)});
    at+=length+12;
  }
  return result;
}
test('all chunks of a genuine one-pixel PNG carry correct CRC-32',()=> {
  for (const {at,length} of offsets(png)) assert.equal(pngChunkCrcValid(png,at,length),true);
});
test('tampered pixel data and image dimensions are rejected',()=> {
  for (const type of ['IDAT','IHDR']) {
    const bytes=Buffer.from(png);
    const {at,length}=offsets(bytes).find(c=>c.type===type);
    bytes[at+8] ^= 1;
    assert.equal(pngChunkCrcValid(bytes,at,length),false);
  }
});
test('integrity applies to metadata chunks even if a sanitizer would strip them',()=> {
  const payload=Buffer.from('person@example.invalid');
  const header=Buffer.alloc(8);
  header.writeUInt32BE(payload.length);
  header.write('tEXt',4);
  const forged=Buffer.concat([header,payload,Buffer.alloc(4)]);
  assert.equal(pngChunkCrcValid(forged,0,payload.length),false);
});
test('truncated, overflowing, fractional and negative input is rejected',()=> {
  const ihdr=offsets(png)[0];
  for (const [bytes,at,len] of [[png,ihdr.at,2**32],[png,ihdr.at,-1],[png,ihdr.at,1.5],
    [png,8.1,13],[png, -1, 13],[png.subarray(0,25),8,13]]) {
    assert.equal(pngChunkCrcValid(bytes,at,len),false);
  }
});
test('CRC verifies retained IEND and refuses a changed checksum',()=> {
  const bytes=Buffer.from(png);
  const end=offsets(bytes).find(c=>c.type==='IEND');
  assert.equal(pngChunkCrcValid(bytes,end.at,end.length),true);
  bytes[end.at+8] ^= 1;
  assert.equal(pngChunkCrcValid(bytes,end.at,end.length),false);
});
