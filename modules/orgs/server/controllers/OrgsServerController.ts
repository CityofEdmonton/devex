'use strict';

import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import { Types } from 'mongoose';
import multer from 'multer';
import config from '../../../../config/ApplicationConfig';
import CoreServerErrors from '../../../core/server/controllers/CoreServerErrors';
import CoreServerHelpers from '../../../core/server/controllers/CoreServerHelpers';
import MessagesServerController from '../../../messages/server/controllers/MessagesServerController';
import { ProposalModel } from '../../../proposals/server/models/ProposalModel';
import { IUserModel } from '../../../users/server/models/UserModel';
import { IOrgModel, OrgModel } from '../models/OrgModel';

class OrgsServerController {
	public static getInstance() {
		return this.instance || (this.instance = new this());
	}

	private static instance: OrgsServerController;
	private popfields = '_id lastName firstName displayName profileImageURL capabilities capabilitySkills';

	private constructor() {
		this.read = this.read.bind(this);
		this.update = this.update.bind(this);
		this.create = this.create.bind(this);
		this.delete = this.delete.bind(this);
		this.list = this.list.bind(this);
		this.logo = this.logo.bind(this);
		this.orgByID = this.orgByID.bind(this);
		this.getOrgById = this.getOrgById.bind(this);
		this.acceptRequest = this.acceptRequest.bind(this);
		this.declineRequest = this.declineRequest.bind(this);
		this.removeMember = this.removeMember.bind(this);
		this.removeUserFromMemberList = this.removeUserFromMemberList.bind(this);
		this.removeMeFromCompany = this.removeMeFromCompany.bind(this);
		this.myadmin = this.myadmin.bind(this);
		this.my = this.my.bind(this);
	}

	public async getOrgById(id: string): Promise<IOrgModel> {
		const org = await OrgModel.findById(id);
		const populatedOrg = await this.populateOrg(org);
		return populatedOrg;
	}

	public async removeUserFromMemberList(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to edit this organization'
			});
			return;
		}

		const updatedOrg = await this.removeMember(req.profile, req.org);
		res.json(updatedOrg);
	}

	public async removeMeFromCompany(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			res.status(422).send({
				message: 'Valid user not provided'
			});
			return;
		}

		if (!req.org) {
			res.status(422).send({
				message: 'Valid company not provided'
			});
			return;
		}

		const updatedOrg = await this.removeMember(req.user, req.org);
		res.json(updatedOrg);
	}

	public async create(req: Request, res: Response): Promise<void> {
		const org = new OrgModel(req.body);

		// set the owner and also add the owner to the list of admins
		org.owner = req.user;
		const updatedOrg = await this.addAdminToOrg(req.user, org);
		const updatedUser = await this.addOrgToUser(req.user, org);
		res.json({
			org: updatedOrg,
			user: updatedUser
		});
	}

	public read(req: Request, res: Response): void {
		// If user is not authenticated, only send the publicly available org info
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			const org = _.pick(req.org, ['_id', 'orgImageURL', 'name', 'website', 'capabilities']);
			res.json(org);
		} else {
			res.json(req.org);
		}
	}

	public async update(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to edit this organization'
			});
			return;
		}

		const newOrgInfo = req.body;
		CoreServerHelpers.applyAudit(newOrgInfo, req.user);
		OrgModel.findOneAndUpdate({ _id: req.org.id }, newOrgInfo, { new: true }, async (err, updatedOrg) => {
			if (err) {
				res.status(500).send({
					message: CoreServerErrors.getErrorMessage(err)
				});
			} else {
				const populatedOrg = await this.populateOrg(updatedOrg);
				res.json(populatedOrg);
			}
		});
	}

	public async delete(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to delete this organization'
			});
			return;
		}

		// find the org model so that middleware is properly fired on delete
		const org = await OrgModel.findById(req.org.id);

		try {
			const deletedOrg = await org.remove();
			res.json(deletedOrg);
		} catch (error) {
			res.status(422).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
		}
	}

	public async list(req: Request, res: Response): Promise<void> {
		try {
			const orgs = await OrgModel.find()
				.sort('user.lastName')
				.populate('owner', '_id lastName firstName displayName profileImageURL')
				.populate('createdBy', 'displayName')
				.populate('updatedBy', 'displayName')
				.populate({
					path: 'members',
					select: this.popfields,
					populate: [
						{
							path: 'capabilities',
							model: 'Capability',
							select: 'name code labelClass'
						},
						{
							path: 'capabilitySkills',
							model: 'CapabilitySkill',
							select: 'name code'
						}
					]
				})
				.populate('admins', this.popfields)
				.populate('joinRequests', '_id')
				.exec();
				res.json(orgs);
		} catch (error) {
			res.status(422).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
		}
	}

	public async myadmin(req: Request, res: Response): Promise<void> {
		try {
			const orgs = await OrgModel.find({
				admins: { $in: [req.user._id] }
			})
				.populate('owner', '_id lastName firstName displayName profileImageURL')
				.populate('createdBy', 'displayName')
				.populate('updatedBy', 'displayName')
				.populate({
					path: 'members',
					select: this.popfields,
					populate: [
						{
							path: 'capabilities',
							model: 'Capability',
							select: 'name code labelClass'
						},
						{
							path: 'capabilitySkills',
							model: 'CapabilitySkill',
							select: 'name code'
						}
					]
				})
				.populate('admins', this.popfields)
				.exec();
			res.json(orgs);
		} catch (error) {
			res.status(422).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
		}
	}

	public async my(req: Request, res: Response): Promise<void> {
		try {
			const orgs = await OrgModel.find({
				members: { $in: [req.user._id] }
			})
				.populate('owner', '_id lastName firstName displayName profileImageURL')
				.populate('createdBy', 'displayName')
				.populate('updatedBy', 'displayName')
				.populate({
					path: 'members',
					select: this.popfields,
					populate: [
						{
							path: 'capabilities',
							model: 'Capability',
							select: 'name code labelClass'
						},
						{
							path: 'capabilitySkills',
							model: 'CapabilitySkill',
							select: 'name code'
						}
					]
				})
				.populate('admins', this.popfields)
				.exec();
			res.json(orgs);
		} catch (error) {
			res.status(422).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
		}
	}

	public async orgByID(req: Request, res: Response, next: NextFunction, id: string): Promise<void> {
		if (!Types.ObjectId.isValid(id)) {
			res.status(400).send({
				message: 'Org is invalid'
			});
		}

		try {
			const org = await this.getOrgById(id);
			if (!org) {
				res.status(200).send({});
			} else {
				req.org = org;
				next();
			}
		} catch (error) {
			next(error);
		}
	}

	public async orgByIDSmall(req: Request, res: Response, next: NextFunction, id: string): Promise<void> {
		if (!Types.ObjectId.isValid(id)) {
			res.status(400).send({
				message: 'Org is invalid'
			});
		}

		try {
			const org = await OrgModel.findById(id)
				.populate('owner', '_id lastName firstName displayName profileImageURL')
				.exec();
			if (!org) {
				res.status(200).send({});
			} else {
				req.org = org;
				next();
			}
		} catch (error) {
			return next(error);
		}
	}

	public async logo(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to edit this organization'
			});
			return;
		}

		const org = req.org;
		const storage = multer.diskStorage(config.uploads.diskStorage);
		const upload = multer({ storage }).single('orgImageURL');
		const up = CoreServerHelpers.fileUploadFunctions(org, 'orgImageURL', req, res, upload, org.orgImageURL);

		if (org) {
			try {
				await up.uploadImage();
				await up.updateDocument();
				await up.deleteOldImage();
				res.json(org);
			} catch (error) {
				res.status(422).send({
					message: CoreServerErrors.getErrorMessage(error)
				});
			}
		} else {
			res.status(401).send({
				message: 'invalid org or org not supplied'
			});
		}
	}

	public async joinRequest(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			res.status(403).send({
				message: 'You must be signed in to join a company'
			});
			return;
		}

		const org = req.org;
		const user = req.user as IUserModel;

		if (!org || !user) {
			res.status(422).send({
				message: 'Invalid join request'
			});
			return;
		}

		// check that user does not already having a request on that org and that they aren't already a member
		if (org.joinRequests.map(user => user.id).indexOf(user.id) !== -1 || org.members.map(user => user.id).indexOf(user.id) !== -1 || org.admins.map(user => user.id).indexOf(user.id) !== -1) {
			res.status(422).send({
				message: 'You already have a pending request or are already a member of this company'
			});
			return;
		}

		// add the request to org, add pendingOrg to user, save both, return both in response
		org.joinRequests.push(user);
		user.orgsPending.push(org);
		try {
			const updatedOrg = await org.save();
			updatedOrg.populate('admins', 'email').execPopulate();
			const updatedUser = await user.save();

			// send notification to admins for org
			await MessagesServerController.sendMessages('company-join-request', updatedOrg.admins, { org: updatedOrg, requestingUser: updatedUser });

			res.json({
				user: updatedUser,
				org: updatedOrg
			});
		} catch (error) {
			res.status(500).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
			return;
		}
	}

	// Accepts a join request by moving given user into team member list.  Updates org accordingly and returns.
	public async acceptRequest(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to add members to this company'
			});
			return;
		}

		const org = req.org;
		const requestingMember = req.profile;

		if (!org || !requestingMember) {
			res.status(422).send({
				message: 'Invalid acceptance request'
			});
			return;
		}

		// Ensure that a join request exists for the passed in member and that the requesting member isn't already on the team
		if (org.joinRequests.map(member => member.id).indexOf(requestingMember.id) !== -1 && org.members.map(member => member.id).indexOf(requestingMember.id) === -1) {
			// Move member to team members
			org.members.push(requestingMember);
			org.joinRequests = org.joinRequests.filter(member => member.id !== requestingMember.id);

			// Update user with appropriate membership
			requestingMember.orgsPending = requestingMember.orgsPending.filter(pendingOrg => pendingOrg.id !== org.id);
			requestingMember.orgsMember.push(org);

			// send notification to requesting user
			await MessagesServerController.sendMessages('company-join-request-accepted', [requestingMember], { org });

			// Save the org and user, return both in response
			try {
				const updatedOrg = await org.save();
				const updatedUser = await requestingMember.save();
				res.json({
					user: updatedUser,
					org: updatedOrg
				});
			} catch (error) {
				res.status(500).send({
					message: CoreServerErrors.getErrorMessage(error)
				});
				return;
			}
		} else {
			// Return a no-op
			res.json(org);
		}
	}

	public async declineRequest(req: Request, res: Response): Promise<void> {
		if (!req.user || !this.isUserAdmin(req.org, req.user)) {
			res.status(403).send({
				message: 'You are not authorized to decline requests for this company'
			});
			return;
		}

		const org = req.org;
		const requestingMember = req.profile;

		if (!org || !requestingMember) {
			res.status(422).send({
				message: 'Invalid decline request'
			});
			return;
		}

		// Remove the request from both org and user
		org.joinRequests = org.joinRequests.filter(member => member.id !== requestingMember.id);
		requestingMember.orgsPending = requestingMember.orgsPending.filter(pendingOrg => pendingOrg.id !== org.id);

		// send notification to requesting user
		await MessagesServerController.sendMessages('company-join-request-declined', [requestingMember], { org });

		// Save the org and user and respond with both
		try {
			const updatedOrg = await org.save();
			const updatedUser = await requestingMember.save();
			res.json({
				org: updatedOrg,
				user: updatedUser
			});
		} catch (error) {
			res.status(500).send({
				message: CoreServerErrors.getErrorMessage(error)
			});
			return;
		}
	}

	// Utility function which determines whether the given user is an administrator of the given organization
	private isUserAdmin(org: IOrgModel, user: IUserModel): boolean {
		if (!user || !org) {
			return false;
		}

		if (user.roles.indexOf('admin') >= 0) {
			return true;
		}

		if (
			org.admins
				.map(admin => {
					return admin.id;
				})
				.indexOf(user.id) >= 0
		) {
			return true;
		}

		return false;
	}

	// Updates all OPEN proposals with the given user.
	// Note: if a proposal is SUBMITTED, it will be set back to DRAFT if a user is removed
	private async removeUserFromProposals(user: IUserModel, org: IOrgModel): Promise<void> {
		const rightNow = new Date();
		const proposals = await ProposalModel.find({ org: org._id })
			.populate('opportunity', 'opportunityTypeCd deadline')
			.exec();

		proposals.forEach(proposal => {
			const deadline = new Date(proposal.opportunity.deadline);
			const isSprintWithUs = proposal.opportunity.opportunityTypeCd === 'sprint-with-us';

			if (isSprintWithUs && deadline.getTime() - rightNow.getTime() > 0) {
				const beforeProposalUserCount = proposal.phases.inception.team.length + proposal.phases.proto.team.length + proposal.phases.implementation.team.length;
				proposal.phases.inception.team = proposal.phases.inception.team.filter(member => member.id !== user.id);
				proposal.phases.proto.team = proposal.phases.proto.team.filter(member => member.id !== user.id);
				proposal.phases.implementation.team = proposal.phases.implementation.team.filter(member => member.id !== user.id);
				const afterProposalUserCount = proposal.phases.inception.team.length + proposal.phases.proto.team.length + proposal.phases.implementation.team.length;

				if (beforeProposalUserCount !== afterProposalUserCount) {
					proposal.status = 'Draft';
					proposal.save();
				}
			}
		});
	}

	private async addAdminToOrg(user: IUserModel, org: IOrgModel): Promise<IOrgModel> {
		// depopulate the objects before adding since orgs and users are a circular reference, and mongoose chokes
		org.admins.push(user.toObject({ depopulate: true }));
		org.members.push(user.toObject({ depopulate: true }));
		return await org.save();
	}

	private async addOrgToUser(user: IUserModel, org: IOrgModel): Promise<IUserModel> {
		// depopulate the objects before adding since orgs and users are a circular reference, and mongoose chokes
		user.orgsAdmin.push(org.toObject({ depopulate: true }));
		user.orgsMember.push(org.toObject({ depopulate: true }));
		return await user.save();
	}

	// Removes organizations from user associations, user from org, and user from any open proposals
	private async removeMember(user: IUserModel, org: IOrgModel): Promise<IOrgModel> {
		// update user and save
		user.orgsAdmin = user.orgsAdmin.filter(adminOrg => adminOrg.id !== org.id);
		user.orgsMember = user.orgsMember.filter(memberOrg => memberOrg.id !== org.id);
		await user.save();

		// process proposals for removed user
		await this.removeUserFromProposals(user, org);

		// update org and return
		org.members = org.members.filter(member => member.id !== user.id);
		org.admins = org.admins.filter(admin => admin.id !== user.id);
		const updatedOrg = org.save();
		return updatedOrg;
	}

	// Populates the given org with referenced models
	private async populateOrg(org: IOrgModel): Promise<IOrgModel> {
		return await org
			.populate('owner', '_id lastName firstName displayName profileImageURL')
			.populate('createdBy', 'displayName')
			.populate('updatedBy', 'displayName')
			.populate('admins', this.popfields)
			.populate('capabilities', 'code name')
			.populate('capabilitySkills', 'code name')
			.populate({
				path: 'members',
				select: this.popfields,
				populate: [
					{
						path: 'capabilities',
						model: 'Capability',
						select: 'name code labelClass'
					},
					{
						path: 'capabilitySkills',
						model: 'CapabilitySkill',
						select: 'name code'
					}
				]
			})
			.populate({
				path: 'joinRequests',
				select: this.popfields,
				populate: [
					{
						path: 'capabilities',
						model: 'Capability',
						select: 'name code labelClass'
					},
					{
						path: 'capabilitySkills',
						model: 'CapabilitySkill',
						select: 'name code'
					}
				]
			})
			.populate('invitedUsers')
			.populate('invitedNonUsers')
			.execPopulate();
	}
}

export default OrgsServerController.getInstance();
