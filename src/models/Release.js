const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Release = sequelize.define('Release', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  projectId: { type: DataTypes.UUID, allowNull: false, field: 'project_id', references: { model: 'projects', key: 'id' } },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'unreleased',
    validate: { isIn: [['unreleased', 'released']] }
  },
  releaseDate: { type: DataTypes.DATE, allowNull: true, field: 'release_date' },
  releasedAt: { type: DataTypes.DATE, allowNull: true, field: 'released_at' }
}, {
  tableName: 'releases',
  timestamps: true,
  underscored: true
});

Release.associate = (models) => {
  Release.belongsTo(models.Project, { foreignKey: 'projectId', as: 'project' });
  Release.hasMany(models.Task, { foreignKey: 'releaseId', as: 'tasks' });
};

module.exports = Release;
