import { Router } from "express";
import multer from 'multer';
import BattlePlan from "../database/models/BattlePlan.js";
import dotenv from "dotenv";

const BattleRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

  BattleRouter.post('/saveBattlePlan', upload.single('image'),  (req: any, res: any) => {
    console.log('redbody', req.body)
    console.log(req.body)
    const { mgrsCoord, units, contours, planName } = req.body;
    console.log(new Date().toISOString());
    BattlePlan.create({
      name: planName || `Plan-${new Date().toISOString()}`,
      mgrsCoord,
      imageData: req.file.buffer,
      units,
      contours 
    }).then((data) => {
      console.log('successful saving of data');
      console.log(data);
      res.sendStatus(200);
    }).catch((err) => {
      console.error('failed to save data to the database', err);
      res.sendStatus(500);
    })

  })

  // Get all plans
BattleRouter.get('/plans', async (req: any, res: any) => {
  console.log('attempting to get battle plans');
  try {
    const plans = await BattlePlan.findAll();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plans from battle router' });
  }
});

// Get plan image
BattleRouter.get('/plans/:id/image', async (req: any, res: any) => {
  console.log('attempting to get battle image')
  try {
    const plan = await BattlePlan.findByPk(req.params.id);
    if (!plan) return res.status(404).send('Plan not found');
    
    res.set('Content-Type', 'image/png');
    res.send(plan.imageData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plan image' });
  }
});

  export default BattleRouter;