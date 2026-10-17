// Deployment configuration only. Never accept an origin from a URL parameter.
export function recruitmentTestOrigin(value: string | undefined, fallback: string) {
 const url=new URL(value?.trim()||fallback);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid recruitment test origin');
 return url.origin;
}
