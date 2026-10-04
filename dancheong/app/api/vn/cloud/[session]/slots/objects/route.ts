import {handleVNCloud} from '../../../../../../../lib/vn/cloud-adapter';
export async function POST(request:Request,context:{params:Promise<{session:string}>} ){const p=await context.params;return handleVNCloud(request,p.session,true,undefined);}
