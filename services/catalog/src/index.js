const express = require("express");

const app = express();
app.use(express.json());

let products = [
  {id:1,name:"Laptop",price:1200},
  {id:2,name:"Phone",price:800}
];

app.get("/health",(req,res)=>{
  res.json({service:"catalog"});
});

app.get("/products",(req,res)=>{
  res.json(products);
});

app.get("/products/:id",(req,res)=>{
  const item = products.find(
    p => p.id == req.params.id
  );

  res.json(item);
});

app.post("/products",(req,res)=>{
  products.push(req.body);

  res.json({
    message:"Product added"
  });
});

app.listen(3001,()=>{
  console.log("Catalog running");
});