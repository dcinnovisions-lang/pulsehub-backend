const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Sprint = sequelize.define('Sprint', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  projectId: { type: DataTypes.UUID, allowNull: false, field: 'project_id', references: { model: 'projects', key: 'id' } },
  name: { type: DataTypes.STRING(120), allowNull: false },
  goal: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'planned',
    validate: { isIn: [['planned', 'active', 'completed']] }
  },
  startDate: { type: DataTypes.DATE, allowNull: true, field: 'start_date' },
  endDate: { type: DataTypes.DATE, allowNull: true, field: 'end_date' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by', references: { model: 'users', key: 'id' } }
}, {
  tableName: 'sprints',
  timestamps: true,
  underscored: true
});

Sprint.associate = (models) => {
  Sprint.belongsTo(models.Project, { foreignKey: 'projectId', as: 'project' });
  Sprint.hasMany(models.Task, { foreignKey: 'sprintId', as: 'tasks' });
};

module.exports = Sprint;
