'use strict';

/**
 * Auth.js controller
 *
 * @description: A set of functions called "actions" for managing `Auth`.
 */

/* eslint-disable no-useless-escape */
const _ = require('lodash');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

module.exports = {
  adminCallback: async (ctx) => {
    const params = ctx.request.body;

    // The identifier is required.
    if (!params.identifier) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.email.provide' }] }] : 'Please provide your username or your e-mail.');
    }

    // The password is required.
    if (!params.password) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.password.provide' }] }] : 'Please provide your password.');
    }

    const query = {};

    // Check if the provided identifier is an email or not.
    const isEmail = emailRegExp.test(params.identifier);

    // Set the identifier to the appropriate query field.
    if (isEmail) {
      query.email = params.identifier.toLowerCase();
    } else {
      query.username = params.identifier;
    }

    // Check if the admin exists.
    const admin = await strapi.query('administrator', 'admin').findOne(query);

    if (!admin) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.invalid' }] }] : 'Identifier or password invalid.');
    }

    if (admin.blocked === true) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.blocked' }] }] : 'Your account has been blocked by the administrator.');
    }

    const validPassword = strapi.plugins['users-permissions'].services.user.validatePassword(params.password, admin.password);

    if (!validPassword) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.invalid' }] }] : 'Identifier or password invalid.');
    } else {
      admin.isAdmin = true;

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue(_.pick(admin.toJSON ? admin.toJSON() : admin, ['_id', 'id'])),
        user: _.omit(admin.toJSON ? admin.toJSON() : admin, ['password', 'resetPasswordToken'])
      });
    }
  },

  adminRegister: async (ctx) => {
    const params = ctx.request.body;

    // Username is required.
    if (!params.username) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.username.provide' }] }] : 'Please provide your username.');
    }

    // Email is required.
    if (!params.email) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.email.provide' }] }] : 'Please provide your email.');
    }

    // Password is required.
    if (!params.password) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.password.provide' }] }] : 'Please provide your password.');
    }

    // Throw an error if the password selected by the user
    // contains more than two times the symbol '$'.
    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.password.format' }] }] : 'Your password cannot contain more than three times the symbol `$`.');
    }

    // First, check if the admin is the first one to register as admin.
    const admins = await strapi.query('administrator', 'admin').find();
    const hasAdmin = admins.length > 0;

    if (hasAdmin) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.admin.exist' }] }] : 'You can\'t register a new admin.');
    }

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    }

    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const admin = await strapi.query('administrator', 'admin').findOne({
      email: params.email
    });

    if (admin) {
      return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.email.taken' }] }] : 'Email is already taken.');
    }

    try {
      const admin = await strapi.query('administrator', 'admin').create(params);

      admin.isAdmin = true;

      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(admin.toJSON ? admin.toJSON() : admin, ['_id', 'id']));

      strapi.emit('didCreateFirstAdmin');

      ctx.send({
        jwt,
        user: _.omit(admin.toJSON ? admin.toJSON() : admin, ['password', 'resetPasswordToken'])
      });
    } catch(err) {
      console.log('err', err);
      const adminError = _.includes(err.message, 'username') ? 'Auth.form.error.username.taken' : 'Auth.form.error.email.taken';

      ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message);
    }
  }
};