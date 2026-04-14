// RBAC V2 — STEP 14
// Updated invite controller to support all V2 workspace and project roles.
// When a project-level invite is accepted, the user is added to project_members
// (in addition to workspace_members if not already a member).
// Permission checks now use workspace_members.role instead of workspace.ownerId.

const { Invite, User, Workspace, Project, WorkspaceMembers, ProjectMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');
const { createNotification } = require('./notification.controller');
const { canManageWorkspaceMembers, canManageProjectMembers } = require('./invite-permissions.controller');

// All valid workspace-level roles that can be invited
const WORKSPACE_INVITE_ROLES = ['admin', 'billing_admin', 'pm', 'member', 'commenter', 'viewer', 'guest'];

// All valid project-level roles that can be invited
const PROJECT_INVITE_ROLES = ['project_lead', 'contributor', 'reporter', 'reviewer', 'commenter', 'viewer'];

// Role display names for the invite email
const ROLE_LABELS = {
  admin: 'Admin',
  billing_admin: 'Billing Admin',
  pm: 'Project Manager',
  member: 'Member',
  commenter: 'Commenter',
  viewer: 'Viewer',
  guest: 'Guest',
  project_lead: 'Project Lead',
  contributor: 'Contributor',
  reporter: 'Reporter',
  reviewer: 'Reviewer',
};

// ─── SMTP Transporter (singleton — created once, reused) ─────────────────────
let _smtpTransporter = null;
let _smtpInitialized = false;

const getEmailTransporter = () => {
  if (_smtpInitialized) return _smtpTransporter;
  _smtpInitialized = true;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('[SMTP] Not configured — invite emails will log URL only. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env');
    return null;
  }

  try {
    const port = parseInt(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    _smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,                              // true for 465 (SSL), false for 587 (STARTTLS)
      requireTLS: !secure && port === 587, // force STARTTLS upgrade on port 587
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: {
        // Allow self-signed certs in dev; set SMTP_TLS_REJECT_UNAUTHORIZED=true for prod
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true'
      }
    });

    // Non-blocking verify — logs success/failure, does not block server startup
    _smtpTransporter.verify((err) => {
      if (err) {
        logger.error(`[SMTP] Verification FAILED for ${process.env.SMTP_USER}: ${err.message}`);
        logger.error('[SMTP] Common fixes: (1) Enable 2-Step Verification on Gmail account, (2) Use a Gmail App Password (not your real password), (3) Check SMTP_HOST/PORT settings');
        _smtpTransporter = null; // Mark as broken so sendMail is not attempted
      } else {
        logger.info(`[SMTP] Ready — authenticated as ${process.env.SMTP_USER}`);
      }
    });

    return _smtpTransporter;
  } catch (err) {
    logger.error('[SMTP] Failed to create transporter:', err.message);
    return null;
  }
};

// ─── Email template helper ─────────────────────────────────────────────────────
const buildInviteEmailHtml = ({ inviter, targetName, targetType, roleLabel, inviteUrl }) => {
  const inviterName = inviter
    ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
    : 'A team member';

  const targetTypeLabel = targetType === 'project' ? 'Project' : 'Workspace';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>You're invited to Projva</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">

      <!-- Outer card wrapper -->
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background-color:#0f172a;border-radius:12px 12px 0 0;padding:24px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#3b82f6;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                        <span style="color:white;font-size:17px;font-weight:800;line-height:32px;display:block;">P</span>
                      </td>
                      <td style="padding-left:10px;vertical-align:middle;">
                        <span style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Projva</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="color:#64748b;font-size:12px;">Project Management</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── HERO BAND ── -->
        <tr>
          <td style="background-color:#1e40af;padding:28px 36px 24px;text-align:center;border-left:1px solid #1e3a8a;border-right:1px solid #1e3a8a;">
            <p style="color:#bfdbfe;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px;">Workspace Invitation</p>
            <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.4px;">You're Invited!</h1>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="background-color:#ffffff;padding:36px 36px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

            <!-- Greeting -->
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
              <strong style="color:#0f172a;">${inviterName}</strong> has invited you to join
              the <strong style="color:#0f172a;">${targetTypeLabel.toLowerCase()}</strong>
              <strong style="color:#3b82f6;">&nbsp;${targetName}&nbsp;</strong> on Projva.
            </p>

            <!-- Invite details card -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
              <tr>
                <td style="padding:6px 20px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">

                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="color:#64748b;font-size:13px;">Type</span>
                      </td>
                      <td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="color:#0f172a;font-size:13px;font-weight:600;">${targetTypeLabel}</span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="color:#64748b;font-size:13px;">${targetTypeLabel} Name</span>
                      </td>
                      <td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="color:#0f172a;font-size:13px;font-weight:600;">${targetName}</span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="color:#64748b;font-size:13px;">Your Role</span>
                      </td>
                      <td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <span style="background-color:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;padding:3px 12px;border-radius:20px;display:inline-block;">${roleLabel}</span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0;">
                        <span style="color:#64748b;font-size:13px;">Invited By</span>
                      </td>
                      <td align="right" style="padding:12px 0;">
                        <span style="color:#0f172a;font-size:13px;font-weight:600;">${inviterName}</span>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${inviteUrl}"
                     style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 44px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:-0.1px;mso-padding-alt:0;text-align:center;">
                    Accept Invitation &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- What happens next -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="color:#065f46;font-size:13px;font-weight:600;margin:0 0 8px;">What happens when you accept:</p>
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:3px 0;color:#047857;font-size:13px;vertical-align:top;">&#10003;&nbsp;</td>
                      <td style="padding:3px 0;color:#047857;font-size:13px;">You'll be added to <strong>${targetName}</strong> as <strong>${roleLabel}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:3px 0;color:#047857;font-size:13px;vertical-align:top;">&#10003;&nbsp;</td>
                      <td style="padding:3px 0;color:#047857;font-size:13px;">No account? Create one for free when you click Accept</td>
                    </tr>
                    <tr>
                      <td style="padding:3px 0;color:#047857;font-size:13px;vertical-align:top;">&#10003;&nbsp;</td>
                      <td style="padding:3px 0;color:#047857;font-size:13px;">Your data stays private and secure</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Expiry notice -->
            <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
              &#9200; This invitation expires in <strong>7 days</strong>
            </p>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 16px;">
              <a href="${inviteUrl}" style="color:#3b82f6;font-size:11px;word-break:break-all;text-decoration:none;">${inviteUrl}</a>
            </p>
            <p style="color:#cbd5e1;font-size:11px;margin:0;line-height:1.6;">
              You received this because ${inviterName} invited you to Projva.<br>
              If you didn't expect this, you can safely ignore this email.
            </p>
          </td>
        </tr>

      </table>
      <!-- End outer card -->

    </td></tr>
  </table>
</body>
</html>`;
};

/**
 * @desc    Send workspace or project invite
 * @route   POST /api/v1/invites
 * @access  Private
 */
const sendInvite = async (req, res, next) => {
  try {
    const { email, workspaceId, projectId, role } = req.body;
    const callerId = req.user.id;
    const callerRole = req.user.role;

    // Validate inputs
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!workspaceId && !projectId) {
      return res.status(400).json({ success: false, error: 'Either workspaceId or projectId is required' });
    }

    // Determine invite type and validate role
    const isProjectInvite = Boolean(projectId);
    const allowedRoles = isProjectInvite ? PROJECT_INVITE_ROLES : WORKSPACE_INVITE_ROLES;
    const effectiveRole = role || (isProjectInvite ? 'contributor' : 'member');

    if (!allowedRoles.includes(effectiveRole)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. ${isProjectInvite ? 'Project' : 'Workspace'} invite roles: ${allowedRoles.join(', ')}`
      });
    }

    // ── Workspace invite ──────────────────────────────────────────────────────
    if (workspaceId && !projectId) {
      const workspace = await Workspace.findByPk(workspaceId);
      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }

      const allowed = await canManageWorkspaceMembers(workspaceId, callerId, callerRole);
      if (!allowed) {
        return res.status(403).json({ success: false, error: 'Not authorized to send workspace invites' });
      }

      // Prevent inviting existing members
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        const existingMember = await WorkspaceMembers.findOne({
          where: { workspaceId, userId: existingUser.id }
        });
        if (existingMember) {
          return res.status(400).json({ success: false, error: 'User is already a member of this workspace' });
        }
      }
    }

    // ── Project invite ────────────────────────────────────────────────────────
    if (projectId) {
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      const effectiveWorkspaceId = workspaceId || project.workspaceId;
      const allowed = await canManageProjectMembers(projectId, effectiveWorkspaceId, callerId, callerRole);
      if (!allowed) {
        return res.status(403).json({ success: false, error: 'Not authorized to send project invites' });
      }

      // Prevent inviting existing project members
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        const existingPM = await ProjectMembers.findOne({ where: { projectId, userId: existingUser.id } });
        if (existingPM) {
          return res.status(400).json({ success: false, error: 'User is already a member of this project' });
        }
      }
    }

    // Check for existing pending invite (avoid duplicates)
    const existingInvite = await Invite.findOne({
      where: {
        email,
        workspaceId: workspaceId || null,
        projectId: projectId || null,
        status: 'pending'
      }
    });
    if (existingInvite && !existingInvite.isExpired()) {
      return res.status(400).json({ success: false, error: 'A pending invite already exists for this email' });
    }

    // Create invite record
    const invite = await Invite.create({
      email,
      workspaceId: workspaceId || null,
      projectId: projectId || null,
      role: effectiveRole,
      invitedBy: callerId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Build invite URL (used for email and returned in response for manual sharing)
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${invite.token}`;

    // Send email
    try {
      const transporter = getEmailTransporter();
      const workspace = workspaceId ? await Workspace.findByPk(workspaceId) : null;
      const project = projectId ? await Project.findByPk(projectId) : null;
      const targetName = project?.name || workspace?.name || 'Projva';
      const targetType = project ? 'project' : 'workspace';
      const inviter = await User.findByPk(callerId, { attributes: ['firstName', 'lastName'] });
      const roleLabel = ROLE_LABELS[effectiveRole] || effectiveRole;

      if (transporter) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@projva.io',
          to: email,
          subject: `You've been invited to join ${targetName} on Projva`,
          html: buildInviteEmailHtml({ inviter, targetName, targetType, roleLabel, inviteUrl }),
          text: `${inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Someone'} invited you to join ${targetName} as ${roleLabel}.\n\nAccept: ${inviteUrl}\n\nExpires in 7 days.`
        });
        logger.info(`Invite email sent to ${email}`);
      } else {
        logger.info(`[INVITE] No SMTP configured — invite URL: ${inviteUrl}`);
      }
    } catch (emailErr) {
      logger.error('Failed to send invite email (invite record still created):', emailErr.message);
      // Non-fatal — invite record still created, inviteUrl returned so sender can share manually
    }

    res.status(201).json({ success: true, data: invite, inviteUrl });
  } catch (error) {
    logger.error('sendInvite error:', error);
    next(error);
  }
};

/**
 * @desc    Get invite details by token (public)
 * @route   GET /api/v1/invites/:token
 * @access  Public
 */
const getInviteByToken = async (req, res, next) => {
  try {
    const invite = await Invite.findOne({
      where: { token: req.params.token },
      include: [
        { model: Workspace, as: 'workspace', attributes: ['id', 'name', 'description'] },
        { model: Project,   as: 'project',   attributes: ['id', 'name', 'description'] },
        { model: User,      as: 'inviter',   attributes: ['id', 'firstName', 'lastName', 'email'] }
      ]
    });

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }

    if (!invite.isValid()) {
      return res.status(400).json({
        success: false,
        error: invite.isExpired() ? 'Invite has expired' : 'Invite is no longer valid',
        data: invite
      });
    }

    res.status(200).json({ success: true, data: invite });
  } catch (error) {
    logger.error('getInviteByToken error:', error);
    next(error);
  }
};

/**
 * @desc    Accept invite — adds user to workspace_members AND/OR project_members
 * @route   POST /api/v1/invites/:token/accept
 * @access  Public (new users supply registration data) or Private (existing users)
 */
const acceptInvite = async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ where: { token: req.params.token } });

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }
    if (!invite.isValid()) {
      return res.status(400).json({
        success: false,
        error: invite.isExpired() ? 'Invite has expired' : 'Invite is no longer valid'
      });
    }

    // Resolve authenticated user (optional header)
    let user;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'fallback_secret');
        user = await User.findByPk(decoded.id);
        if (user && user.email !== invite.email) {
          return res.status(400).json({
            success: false,
            error: 'This invite was sent to a different email address'
          });
        }
      } catch {
        user = null;
      }
    }

    // New user — need registration data
    if (!user) {
      const { firstName, lastName, password } = req.body;
      if (!firstName || !lastName || !password) {
        return res.status(400).json({
          success: false,
          error: 'Registration data required',
          requiresRegistration: true
        });
      }

      const existingUser = await User.findOne({ where: { email: invite.email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Account already exists for this email. Please log in to accept the invite.'
        });
      }

      user = await User.create({
        email: invite.email,
        firstName,
        lastName,
        password,
        role: 'member'
      });
    }

    // ── For workspace invite: add to workspace_members ────────────────────────
    if (invite.workspaceId && !invite.projectId) {
      const isWorkspaceRole = WORKSPACE_INVITE_ROLES.includes(invite.role);
      const wsRole = isWorkspaceRole ? invite.role : 'member';

      const existing = await WorkspaceMembers.findOne({
        where: { workspaceId: invite.workspaceId, userId: user.id }
      });
      if (!existing) {
        await WorkspaceMembers.create({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: wsRole
        });
      }
    }

    // ── For project invite: ensure workspace member + add to project_members ───
    if (invite.projectId) {
      const project = await Project.findByPk(invite.projectId);
      if (project) {
        // Ensure workspace membership exists (add as member if not already)
        const wsExisting = await WorkspaceMembers.findOne({
          where: { workspaceId: project.workspaceId, userId: user.id }
        });
        if (!wsExisting) {
          await WorkspaceMembers.create({
            workspaceId: project.workspaceId,
            userId: user.id,
            role: 'member' // default workspace role for project invitees
          });
        }

        // Add to project_members with the project role
        const isProjectRole = PROJECT_INVITE_ROLES.includes(invite.role);
        const projRole = isProjectRole ? invite.role : 'contributor';

        const pmExisting = await ProjectMembers.findOne({
          where: { projectId: invite.projectId, userId: user.id }
        });
        if (!pmExisting) {
          await ProjectMembers.create({
            projectId: invite.projectId,
            userId: user.id,
            role: projRole,
            invitedBy: invite.invitedBy,
            joinedAt: new Date()
          });
        }
      }
    }

    // Mark invite as accepted
    await invite.update({ status: 'accepted', acceptedAt: new Date() });

    // Notify the inviter that their invite was accepted
    try {
      const acceptorName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      const entityName = invite.projectId
        ? (await Project.findByPk(invite.projectId, { attributes: ['name'] }))?.name || 'a project'
        : (await Workspace.findByPk(invite.workspaceId, { attributes: ['name'] }))?.name || 'a workspace';

      await createNotification({
        userId:     invite.invitedBy,
        type:       'invite_accepted',
        title:      `${acceptorName} accepted your invite`,
        body:       `They joined "${entityName}"`,
        entityType: invite.projectId ? 'project' : 'workspace',
        entityId:   invite.projectId || invite.workspaceId,
        actorId:    user.id,
        metadata:   {
          url: invite.projectId
            ? `/app/projects/${invite.projectId}`
            : `/app/workspaces/${invite.workspaceId}`
        }
      });
    } catch (notifErr) {
      logger.warn('Failed to send invite_accepted notification', notifErr);
    }

    res.status(200).json({
      success: true,
      message: 'Invite accepted successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        workspaceId: invite.workspaceId,
        projectId: invite.projectId
      }
    });
  } catch (error) {
    logger.error('acceptInvite error:', error);
    next(error);
  }
};

/**
 * @desc    List invites for a workspace or project
 * @route   GET /api/v1/invites
 * @access  Private
 */
const listInvites = async (req, res, next) => {
  try {
    const { workspaceId, projectId, status = 'pending' } = req.query;

    const whereClause = { status };
    if (workspaceId) whereClause.workspaceId = workspaceId;
    if (projectId) whereClause.projectId = projectId;

    const invites = await Invite.findAll({
      where: whereClause,
      include: [{ model: User, as: 'inviter', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, count: invites.length, data: invites });
  } catch (error) {
    logger.error('listInvites error:', error);
    next(error);
  }
};

/**
 * @desc    Cancel invite
 * @route   DELETE /api/v1/invites/:id
 * @access  Private
 */
const cancelInvite = async (req, res, next) => {
  try {
    const invite = await Invite.findByPk(req.params.id);
    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }

    // Allow: original sender, super_admin, or workspace/project admin
    const callerId = req.user.id;
    const callerRole = req.user.role;

    if (invite.invitedBy !== callerId && callerRole !== 'super_admin') {
      let authorized = false;

      if (invite.workspaceId) {
        authorized = await canManageWorkspaceMembers(invite.workspaceId, callerId, callerRole);
      } else if (invite.projectId) {
        const project = await Project.findByPk(invite.projectId);
        if (project) {
          authorized = await canManageProjectMembers(invite.projectId, project.workspaceId, callerId, callerRole);
        }
      }

      if (!authorized) {
        return res.status(403).json({ success: false, error: 'Not authorized to cancel this invite' });
      }
    }

    await invite.update({ status: 'cancelled' });
    res.status(200).json({ success: true, message: 'Invite cancelled successfully' });
  } catch (error) {
    logger.error('cancelInvite error:', error);
    next(error);
  }
};

module.exports = {
  WORKSPACE_INVITE_ROLES,
  PROJECT_INVITE_ROLES,
  ROLE_LABELS,
  getEmailTransporter,
  sendInvite,
  getInviteByToken,
  acceptInvite,
  listInvites,
  cancelInvite,
  buildInviteEmailHtml,
};
