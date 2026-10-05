// Auto-approve native build for bcrypt
module.exports = {
  hooks: {
    readPackage(pkg) {
      return pkg;
    },
  },
};
