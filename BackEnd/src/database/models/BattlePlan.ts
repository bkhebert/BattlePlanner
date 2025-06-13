// src/models/BattlePlan.ts
import { DataTypes, Optional, Model } from 'sequelize';
import database from '../db.js';

interface BattlePlanAttributes {
  id?: number;
  name: string;
  mgrsCoord: string;
  imageData: any;
  units: string; // JSON string of units
  contours: string; // JSON string of contours
  createdAt?: Date; // Added by Sequelize
  updatedAt?: Date; // Added by Sequelize
}

interface BattlePlanCreationAttributes extends Optional<BattlePlanAttributes, 
'id' | 'createdAt' | 'updatedAt'>  {}


interface BattlePlanInstance extends Model<BattlePlanAttributes>, BattlePlanAttributes {}

const BattlePlan = database.define<BattlePlanInstance>( 
  'Battleplan',
  {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mgrsCoord: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imageData: {
    type: DataTypes.BLOB,
    allowNull: false
  },
  units: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      return JSON.parse(this.getDataValue('units'));
    },
    set(value) {
      this.setDataValue('units', JSON.stringify(value));
    }
  },
  contours: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      return JSON.parse(this.getDataValue('contours'));
    },
    set(value) {
      this.setDataValue('contours', JSON.stringify(value));
    }
  }
}, {
  modelName: 'BattlePlan',
  timestamps: true
});

export default BattlePlan;