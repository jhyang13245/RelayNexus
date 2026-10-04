import {handleVNCloud} from '../../../../../../../../lib/vn/cloud-adapter';
export async function GET(request:Request,context:{params:Promise<{session:string;hash:string}>} ){const p=await context.params;return handleVNCloud(request,p.session,true,p.hash);}
export async function PUT(request:Request,context:{params:Promise<{session:string;hash:string}>} ){const p=await context.params;return handleVNCloud(request,p.session,true,p.hash);}
