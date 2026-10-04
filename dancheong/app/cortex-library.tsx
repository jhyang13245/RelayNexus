"use client";
import {ReadingModeChoice} from "./components/reading-mode";
import {useEffect,useState} from "react";
import {NexusLibraryHome} from "./components/nexus-library-home";
import {hubSourceProjectId} from "../lib/hub-package";
import {installHubRevisionPackage,resolveInstalledHubRevision} from "./hub-revision-package";
import {CORTEX_CATALOG_CHANGED,readCortexCatalog,removeCortexProject,removeCortexSessions,setCortexProjectThumbnail,visibleCortexSessions,type CortexSession} from "./hooks/use-runtime-engine";
type Project={id:string;sourceProjectId?:string;title:string;genre:string;playerName:string;packageVersion:string;sessionCount:number;updatedAt:string;thumbnailUrl?:string};
export function CortexLibrary({projects,onOpen,onImportZip,onImportFile,onSettings,onAccount,signOutHref,onDeleteAccountProject}:{projects:Project[];onOpen:(row:CortexSession)=>void;onImportZip:()=>void;onImportFile:(file:File,project?:{id:string;name:string;sourceProjectId?:string;thumbnailUrl?:string})=>void;onSettings:()=>void;onAccount:()=>void;signOutHref?:string;onDeleteAccountProject:(projectId:string)=>Promise<void>}){
 const [rows,setRows]=useState<CortexSession[]>([]);
 useEffect(()=>{const refresh=()=>setRows(readCortexCatalog());refresh();window.addEventListener(CORTEX_CATALOG_CHANGED,refresh);return()=>window.removeEventListener(CORTEX_CATALOG_CHANGED,refresh)},[]);
 const accountProjects=projects.filter(p=>p.id!=="demo-project"),accountProjectIds=new Set(accountProjects.map(p=>p.id));
 const visibleRows=visibleCortexSessions(rows,accountProjectIds);
 const catalog=[...accountProjects];
 for(const row of visibleRows)if(!catalog.some(p=>p.id===row.projectId))catalog.push({id:row.projectId,sourceProjectId:row.sourceProjectId,title:row.name,genre:"Cortex 작품",playerName:"작품의 주인공",packageVersion:"1.5",sessionCount:0,updatedAt:row.lastPlayedAt||new Date().toISOString(),thumbnailUrl:row.thumbnailUrl});
 const sessions=visibleRows.map(r=>({...r,turn:r.turn||0,day:0,location:r.location||"장면 미시작",preview:r.preview||"이 기기의 Cortex 기록",lastPlayedAt:r.lastPlayedAt||new Date().toISOString()}));
 return <><NexusLibraryHome cortexMode modeControls={<ReadingModeChoice/>} projects={catalog.map(p=>({...p,sessionCount:visibleRows.filter(r=>r.projectId===p.id).length}))} sessions={sessions} activeProjectId={visibleRows.at(-1)?.projectId||catalog[0]?.id||""} accountName="단청" busy={false}
 onOpenSession={async id=>{const row=visibleRows.find(r=>r.id===id);if(row)onOpen(row)}}
 onCreateSession={async projectId=>{const project=catalog.find(p=>p.id===projectId);onOpen({id:crypto.randomUUID(),projectId,name:project?.title||"새 이야기",sourceProjectId:project?.sourceProjectId,thumbnailUrl:project?.thumbnailUrl})}}
 onDeleteSession={async id=>{if(!confirm("이 Cortex 세션의 기기·계정 저장 기록을 삭제할까요?"))return;await removeCortexSessions([id])}}
 onDeleteProject={async projectId=>{if(accountProjectIds.has(projectId)){await onDeleteAccountProject(projectId);return}if(!confirm("이 작품과 기기에 저장된 모든 Cortex 세션을 삭제할까요?"))return;await removeCortexProject(projectId)}}
 onImportZip={onImportZip} signOutHref={signOutHref} onResolveHubRevision={resolveInstalledHubRevision} onInstallHubWork={async work=>{
   const {projectId,file}=await installHubRevisionPackage(work);
   const sourceProjectId=hubSourceProjectId(work)||work.slug;
   onImportFile(file,{id:projectId,name:work.title,sourceProjectId,thumbnailUrl:work.coverUrl});
 }} onRestoreHubCover={async(work,project)=>setCortexProjectThumbnail(project.id,work.coverUrl)} onOpenSettings={onSettings} onOpenAccount={onAccount}/></>;
}
