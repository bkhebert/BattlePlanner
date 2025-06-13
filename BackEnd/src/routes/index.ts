import { Router } from "express";
import BattleRouter from "./battleroutes";

const apiRouter = Router();

apiRouter.use('/battle', BattleRouter);


export default apiRouter;