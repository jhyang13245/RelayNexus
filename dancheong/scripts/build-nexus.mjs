import {spawnSync} from 'node:child_process';
const run=(args)=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',timeout:240000});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1)};
run(['scripts/install-vn-vision.mjs','--check']);
run(['scripts/vendor-cortex.mjs']);
run(['scripts/scope-jieum.mjs']);
run(['scripts/create-source-export.mjs']);
run(['node_modules/vinext/dist/cli.js','build']);
run(['scripts/validate-artifact.mjs']);
