// Optional Edge entry point. JWT validation and the database command both authenticate.
// Clients may call the PostgreSQL RPC directly; both paths use the same transaction.
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:cors});
 try{
  const authorization=req.headers.get('Authorization');
  if(!authorization)throw new Error('Authentication required');
  const api=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:user,error:authError}=await api.auth.getUser();
  if(authError||!user.user)return Response.json({error:'Invalid session'},{status:401,headers:cors});
  const {action,payload}=await req.json();
  const {data,error}=await api.rpc('command',{action,payload});
  if(error)return Response.json({error:error.message},{status:400,headers:cors});
  return Response.json(data,{headers:cors});
 }catch{return Response.json({error:'Invalid request'},{status:400,headers:cors})}
});
