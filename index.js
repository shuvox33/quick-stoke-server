const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const port = process.env.PORT || 8000
const stripe = require("stripe")(process.env.STRIPE_SECRETE_KEY)


// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))


const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5metfvs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {

    const usersCollection = client.db('quickStock').collection('users')
    const storeCollection = client.db('quickStock').collection('store')
    const productCollection = client.db('quickStock').collection('product')
    const salesCollection = client.db('quickStock').collection('sales')
    const subscriptionCollection = client.db('quickStock').collection('subscription')




    //payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const price = req.body.price;
      const priceCent = parseFloat(price) * 100;
      if(!price || priceCent < 1) return ;

      const {client_secret} = await stripe.paymentIntents.create({
        amount: priceCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({clientSecret : client_secret})
    })

    //store subscription information
    app.post('/subscription', async(req, res)=>{
      const info = req.body;
      const result = await subscriptionCollection.insertOne(info)
      res.send(result)
    })



    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      console.log('I need a new jwt', user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res.clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        }).send({ success: true })

        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // Save or modify user email, status in DB
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const options = { upsert: true }
      const isExist = await usersCollection.findOne(query)
      console.log('User found?----->', isExist)
      if (isExist) return res.send(isExist)
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      )
      res.send(result)
    })

    //update role
    app.put('/user/update/:email', async (req, res) => {
      const senderMail = req.params.email;
      const user = req.body;
      const { role, email } = user;
      console.log(role, email);

      const query = { email: email }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          role,
          timestamp: Date.now()
        }
      }

      const result = await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)

    })

    //get role
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    })
    // get owner info 
    app.get('/user-info/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result)
    })


    //store //

    // create store
    app.post('/create-store', async (req, res) => {
      const storeInfo = req.body;
      console.log(storeInfo);
      const result = await storeCollection.insertOne(storeInfo);
      res.send(result)
    })
    //get store info
    app.get('/store-info/:email', async (req, res) => {
      const email = req.params.email;
      const result = await storeCollection.findOne({ ownerEmail: email });
      res.send(result)
    })
    // reduce limit
    app.patch('/reduce-limit/:email', async (req, res) => {
      const email = req.params.email;
      const query = { ownerEmail: email }
      const updateDoc = {
        $inc: {
          limit: -1
        }
      }
      const result = await storeCollection.updateOne(query, updateDoc)
      res.send(result)
    })
    //increase limit
    app.patch('/increase-limit/:email', async (req, res) => {
      const email = req.params.email;
      const query = { ownerEmail: email }
      const updateDoc = {
        $inc: {
          limit: 1
        }
      }
      const result = await storeCollection.updateOne(query, updateDoc)
      res.send(result)
    })


    //product related api

    //total product
    app.get('/total-product/:email', async (req, res) => {
      const email = req.params.email;
      const count = await productCollection.find({ ownerEmail: email }).toArray();
      res.send({ count: count.length })
    })
    //add product
    app.post('/add-product', async (req, res) => {
      const productInfo = req.body;
      const result = await productCollection.insertOne(productInfo);
      res.send(result);
    })
    //get added product
    app.get('/added-product/:email', async (req, res) => {
      const email = req.params.email;
      const result = await productCollection.find({ ownerEmail: email }).toArray();
      res.send(result)
    })
    //update product
    app.put('/update-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const product = req.body;
        product?._id && delete product._id;

        const result = await productCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: product },
          { returnOriginal: false }
        );

        res.send(result)
      } catch (error) {
        console.error(error)
      }
    })
    //delete product
    app.delete('/delete-product/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = productCollection.deleteOne(query)
      res.send(result);
    })



    //sales
    app.post('/sales', async (req, res) => {
      // product.data = new Date();
      const product = req.body;
      const result = await salesCollection.insertOne(product)
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Quick Stock server..')
})

app.listen(port, () => {
  console.log(`Quick Stock is running on port ${port}`)
})
