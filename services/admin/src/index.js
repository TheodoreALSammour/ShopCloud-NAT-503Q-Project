const express = require("express");

const app = express();
app.use(express.json());

app.get("/health",(req,res)=>{
  res.json({service:"admin"});
});

app.get("/dashboard",(req,res)=>{
  res.json({
    users:120,
    orders:44,
    revenue:9000
  });
});

app.listen(3004,()=>{
  console.log("Admin running");
});