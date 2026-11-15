"use client";
import {useEffect,useState} from "react";
import {Shell,api} from "../components/Shell";

type StaffMember={userId:string;name:string;email:string;role:"admin"|"employee"};
type CurrentUser={userId:string;role:"admin"|"employee"};

export default function Staff(){
  const [rows,setRows]=useState<StaffMember[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState(false);
  const [currentUser,setCurrentUser]=useState<CurrentUser|null>(null);
  const [access,setAccess]=useState<"checking"|"admin"|"denied">("checking");

  async function load(){
    setLoading(true);
    try{const result=await api("staff");setRows(result.data);setError("")}
    catch(e:any){setError(e.message)}
    finally{setLoading(false)}
  }

  useEffect(()=>{api("me").then((user:CurrentUser)=>{setCurrentUser(user);if(user.role==="admin"){setAccess("admin");void load()}else{setAccess("denied");setLoading(false);setError("You are signed in, but your role does not allow this action.")}}).catch((e:any)=>{setAccess("denied");setLoading(false);setError(e.message)})},[]);

  async function add(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const body=Object.fromEntries(new FormData(form));
    try{await api("staff",{method:"POST",body:JSON.stringify(body)});form.reset();setOpen(false);await load()}
    catch(e:any){setError(e.message)}
  }

  async function role(userId:string,nextRole:string){
    try{await api(`staff/${userId}/role`,{method:"PATCH",body:JSON.stringify({role:nextRole})});await load()}
    catch(e:any){setError(e.message);await load()}
  }

  return <Shell>{access==="checking"?<div className="loading">Checking access…</div>:access==="denied"?<p className="error" role="alert">{error}</p>:<>
    <div className="page-heading"><div><span className="eyebrow">Workspace access</span><h1>Staff</h1><p>Manage who can work in this firm and their access level.</p></div><button className="primary-button" onClick={()=>setOpen(true)}>＋ Add staff</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="toolbar"><span className="secondary-text">TEAM MEMBERS</span><span className="secondary-text">{rows.length} member{rows.length===1?"":"s"}</span></div>
    <section className="surface-card">{loading?<div className="loading">Loading staff…</div>:rows.length===0?<div className="empty-state"><div className="empty-icon">♙</div><h3>No staff members</h3><p>Add a staff member to assign work and collaborate.</p><button className="primary-button" onClick={()=>setOpen(true)}>Add staff member</button></div>:<div className="table-wrap"><table><thead><tr><th>Team member</th><th>Email</th><th>Role</th></tr></thead><tbody>{rows.map(member=><tr key={member.userId}><td><div className="avatar-cell"><span className="mini-avatar">{member.name.slice(0,1).toUpperCase()}</span><span className="row-title">{member.name}</span></div></td><td className="client-email">{member.email}</td><td><select className="control" aria-label={`Role for ${member.name}`} value={member.role} disabled={member.userId===currentUser?.userId} onChange={event=>void role(member.userId,event.target.value)}><option value="admin">Admin</option><option value="employee">Employee</option></select></td></tr>)}</tbody></table></div>}</section>
    {open&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title"><div className="modal-header"><div><h2 id="staff-modal-title">Add staff member</h2><p>They’ll be added to your firm immediately.</p></div><button className="modal-close" aria-label="Close" onClick={()=>setOpen(false)}>×</button></div><form onSubmit={add}><div className="form-grid"><label className="form-field">Full name<input name="name" placeholder="e.g. Alex Morgan" required autoFocus/></label><label className="form-field">Email address<input name="email" type="email" placeholder="alex@example.com" required/></label><label className="form-field">Temporary password<input name="password" type="password" minLength={8} required/></label><label className="form-field">Role<select name="role" defaultValue="employee"><option value="employee">Employee</option><option value="admin">Admin</option></select></label></div><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancel</button><button className="primary-button">Add staff</button></div></form></section></div>}
  </>}</Shell>
}
