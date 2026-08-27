const Layout = ({ children }) => {
  return (
    <>
      <div>
        <p className="text-xl text-black">This is Header</p>
        {children}
        <p>This is Footer</p>
      </div>
    </>
  );
};

export default Layout;
