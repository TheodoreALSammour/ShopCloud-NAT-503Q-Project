const express = require("express");

const app = express();
app.use(express.json());

app.get("/health",(req,res)=>{
  res.json({service:"checkout"});
});

app.post("/checkout",(req,res)=>{
  const {userId,total}=req.body;

  res.json({
    message:"Order placed",
    userId,
    total,
    status:"success"
  });
});

app.listen(3003,()=>{
  console.log("Checkout running");
});