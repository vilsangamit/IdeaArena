import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.use(cors({origin:true,credentials:true}));
app.use(express.json({limit:'2mb'}));
app.use('/uploads',express.static(path.join(__dirname,'uploads')));

const userSchema=new mongoose.Schema({name:{type:String,required:true,trim:true},email:{type:String,required:true,unique:true,lowercase:true,trim:true},password:{type:String,required:true},avatar:{type:String,default:''},bio:{type:String,default:''},createdAt:{type:Date,default:Date.now},resetToken:String,resetExpires:Date});
const ideaSchema=new mongoose.Schema({title:{type:String,required:true},description:{type:String,required:true},category:{type:String,default:'Technology'},tags:[String],authorId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},author:{type:String,required:true},imageURL:String,votes:{type:Number,default:0},comments:{type:Number,default:0},trend:{type:Number,default:70},createdAt:{type:Date,default:Date.now}});
const commentSchema=new mongoose.Schema({ideaId:{type:mongoose.Schema.Types.ObjectId,ref:'Idea'},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},sender:String,text:String,createdAt:{type:Date,default:Date.now}});
const User=mongoose.model('User',userSchema); const Idea=mongoose.model('Idea',ideaSchema); const Comment=mongoose.model('Comment',commentSchema);

const transporter=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE)==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;
const sign=u=>jwt.sign({id:u._id.toString(),name:u.name,email:u.email},process.env.JWT_SECRET||'change-this-secret',{expiresIn:'7d'});
const safe=u=>({id:u._id,name:u.name,email:u.email,avatar:u.avatar,bio:u.bio,createdAt:u.createdAt});
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({message:'Please login first'});req.auth=jwt.verify(h.slice(7),process.env.JWT_SECRET||'change-this-secret');next()}catch{return res.status(401).json({message:'Session expired. Please login again.'})}}
async function mail(to,subject,html){if(!transporter)return false;await transporter.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to,subject,html});return true}

app.get('/api/health',(_,res)=>res.json({ok:true,service:'IdeaArena API',database:mongoose.connection.readyState===1?'connected':'disconnected'}));
app.post('/api/auth/signup',async(req,res)=>{try{const {name,email,password}=req.body;if(!name?.trim()||!email?.trim()||!password||password.length<6)return res.status(400).json({message:'Name, email and a password of at least 6 characters are required.'});if(await User.findOne({email:email.toLowerCase()}))return res.status(409).json({message:'An account with this email already exists.'});const u=await User.create({name:name.trim(),email:email.toLowerCase(),password:await bcrypt.hash(password,12)});await mail(u.email,'Welcome to IdeaArena 🎉',`<div style="font-family:Arial;padding:24px"><h1 style="color:#15784b">Welcome, ${u.name}!</h1><p>Your IdeaArena account is ready. Start sharing ideas, building teams and finding your next big idea.</p></div>`);res.status(201).json({token:sign(u),user:safe(u),welcome:true})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/auth/login',async(req,res)=>{try{const {email,password}=req.body;const u=await User.findOne({email:email?.toLowerCase()});if(!u||!(await bcrypt.compare(password||'',u.password)))return res.status(401).json({message:'Invalid email or password.'});res.json({token:sign(u),user:safe(u)})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/auth/me',auth,async(req,res)=>{const u=await User.findById(req.auth.id);if(!u)return res.status(404).json({message:'User not found'});res.json({user:safe(u)})});
app.put('/api/users/me',auth,async(req,res)=>{const u=await User.findByIdAndUpdate(req.auth.id,{name:req.body.name?.trim(),bio:req.body.bio||''},{new:true,runValidators:true});res.json({user:safe(u)})});
app.post('/api/auth/forgot-password',async(req,res)=>{const u=await User.findOne({email:req.body.email?.toLowerCase()});if(!u)return res.json({message:'If that email exists, a reset link has been sent.'});const token=crypto.randomBytes(32).toString('hex');u.resetToken=token;u.resetExpires=new Date(Date.now()+30*60*1000);await u.save();const base=process.env.CLIENT_URL||'http://localhost:5173';await mail(u.email,'Reset your IdeaArena password',`<div style="font-family:Arial;padding:24px"><h2>Password reset</h2><p>Click below to choose a new password:</p><a href="${base}/?reset=${token}" style="display:inline-block;background:#15784b;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a><p>This link expires in 30 minutes.</p></div>`);res.json({message:'If that email exists, a reset link has been sent.'})});
app.post('/api/auth/reset-password',async(req,res)=>{const u=await User.findOne({resetToken:req.body.token,resetExpires:{$gt:new Date()}});if(!u)return res.status(400).json({message:'Reset link is invalid or expired.'});if(!req.body.password||req.body.password.length<6)return res.status(400).json({message:'Password must be at least 6 characters.'});u.password=await bcrypt.hash(req.body.password,12);u.resetToken=undefined;u.resetExpires=undefined;await u.save();res.json({message:'Password updated successfully.'})});

app.get('/api/ideas',async(req,res)=>{const ideas=await Idea.find().sort({createdAt:-1}).limit(100);res.json({ideas})});
app.post('/api/ideas',auth,async(req,res)=>{const {title,description,category,tags}=req.body;if(!title?.trim()||!description?.trim())return res.status(400).json({message:'Title and description are required.'});const u=await User.findById(req.auth.id);const idea=await Idea.create({title:title.trim(),description:description.trim(),category:category||'Technology',tags:Array.isArray(tags)?tags:[],authorId:u._id,author:u.name,votes:0,comments:0,trend:70});res.status(201).json({idea})});
app.post('/api/ideas/:id/vote',auth,async(req,res)=>{const idea=await Idea.findByIdAndUpdate(req.params.id,{$inc:{votes:1,trend:1}},{new:true});if(!idea)return res.status(404).json({message:'Idea not found'});res.json({idea})});
app.get('/api/ideas/:id/comments',async(req,res)=>res.json({comments:await Comment.find({ideaId:req.params.id}).sort({createdAt:1})}));
app.post('/api/ideas/:id/comments',auth,async(req,res)=>{if(!req.body.text?.trim())return res.status(400).json({message:'Comment cannot be empty.'});const c=await Comment.create({ideaId:req.params.id,userId:req.auth.id,sender:req.auth.name,text:req.body.text.trim()});await Idea.findByIdAndUpdate(req.params.id,{$inc:{comments:1}});res.status(201).json({comment:c})});
app.get('/api/users/leaderboard',async(_,res)=>{const users=await User.find().select('name email avatar').lean();const counts=await Idea.aggregate([{$group:{_id:'$authorId',ideas:{$sum:1},votes:{$sum:'$votes'}}},{$sort:{votes:-1}}]);const map=new Map(counts.map(x=>[String(x._id),x]));res.json({users:users.map(u=>({...u,...(map.get(String(u._id))||{ideas:0,votes:0})})).sort((a,b)=>b.votes-a.votes).slice(0,20)})});

const client=path.join(__dirname,'..','dist');app.use(express.static(client));app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return res.status(404).json({message:'API route not found'});res.sendFile(path.join(client,'index.html'))});
let dbPromise;
export function connectDB(){
  if(mongoose.connection.readyState===1) return Promise.resolve();
  if(!dbPromise){
    const uri=process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/ideaarena';
    dbPromise=mongoose.connect(uri).catch(err=>{dbPromise=undefined; throw err;});
  }
  return dbPromise;
}

app.use('/api',async(req,res,next)=>{
  try{await connectDB(); next();}
  catch(e){res.status(503).json({message:'Database connection failed.',error:e.message})}
});

export default app;

const port=Number(process.env.PORT||5000);
if(process.env.VERCEL!=='1'){
  connectDB().then(()=>app.listen(port,()=>console.log(`IdeaArena API running on http://localhost:${port}`)))
    .catch(e=>{console.error('MongoDB connection failed:',e.message);process.exit(1)});
}
