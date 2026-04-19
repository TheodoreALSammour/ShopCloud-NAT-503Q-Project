const express = require("express");

const app = express();
app.use(express.json());

let carts = {};

app.get("/health",(req,res)=>{
  res.json({service:"cart"});
});

app.post("/cart/:userId/add",(req,res)=>{
  const {userId}=req.params;

  if(!carts[userId]){
    carts[userId] = [];
  }

  carts[userId].push(req.body);

  res.json({
    message:"Added to cart"
  });
});

app.get("/cart/:userId",(req,res)=>{
  res.json(
    carts[req.params.userId] || []
  );
});

app.listen(3002,()=>{
  console.log("Cart running");
});