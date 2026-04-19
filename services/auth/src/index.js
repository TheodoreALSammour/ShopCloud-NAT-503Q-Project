const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const SECRET = "shopcloudsecret";

app.get("/health", (req,res)=>{
  res.json({service:"auth",status:"ok"});
});

app.post("/register",(req,res)=>{
  const {email,password}=req.body;

  res.json({
    message:"User registered",
    email
  });
});

app.post("/login",(req,res)=>{
  const {email}=req.body;

  const token = jwt.sign(
    {email,role:"customer"},
    SECRET,
    {expiresIn:"1h"}
  );

  res.json({token});
});

app.listen(3000,()=>{
  console.log("Auth running on 3000");
});