import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AppBar, Toolbar, IconButton, Menu, MenuItem, Typography, Box, Avatar, Button } from '@mui/material';
import { AccountCircle } from '@mui/icons-material';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import Logger from '../utils/logger';

const NavBar: React.FC = () => {
    const navigate = useNavigate();
    const { user, logout, googleLogin } = useAuth();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = async () => {
        try {
            Logger.info('User logging out');
            await logout();
            handleClose();
            navigate('/login');
        } catch (error) {
            Logger.error('Logout error:', error);
        }
    };

    const handleProfile = () => {
        handleClose();
        Logger.info('Navigate to profile page');
    };

    const handleGoogleSuccess = async (response: any) => {
        try {
            await googleLogin(response.credential);
            navigate('/');
        } catch (error) {
            Logger.error('Google login error:', error);
        }
    };

    const showGoogleButton = !user && process.env.REACT_APP_GOOGLE_CLIENT_ID;

    return (
        <AppBar position="static" color="transparent" elevation={1}>
            <Toolbar>
                <Typography
                    variant="h6"
                    component={RouterLink}
                    to="/"
                    sx={{ flexGrow: 1, color: 'text.primary', textDecoration: 'none' }}
                >
                    Time Logger Game
                </Typography>
                {user ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography
                            variant="body1"
                            sx={{
                                mr: 2,
                                color: 'text.secondary',
                                display: { xs: 'none', sm: 'block' }
                            }}
                        >
                            {user.email}
                        </Typography>
                        <IconButton
                            size="large"
                            aria-label="account menu"
                            aria-controls="menu-appbar"
                            aria-haspopup="true"
                            onClick={handleMenu}
                            color="inherit"
                        >
                            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                                <AccountCircle />
                            </Avatar>
                        </IconButton>
                        <Menu
                            id="menu-appbar"
                            anchorEl={anchorEl}
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'right',
                            }}
                            keepMounted
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            open={Boolean(anchorEl)}
                            onClose={handleClose}
                        >
                            <MenuItem onClick={handleProfile}>Profile</MenuItem>
                            <MenuItem onClick={handleLogout}>Sign Out</MenuItem>
                        </Menu>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {showGoogleButton && (
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() => Logger.error('Google login failed')}
                                size="medium"
                                type="standard"
                                shape="rectangular"
                                text="signin"
                                width="200"
                            />
                        )}
                        <Button
                            component={RouterLink}
                            to="/login"
                            variant="text"
                            size="small"
                            sx={{ textTransform: 'none' }}
                        >
                            Sign In
                        </Button>
                        <Button
                            component={RouterLink}
                            to="/register"
                            variant="contained"
                            size="small"
                            sx={{ textTransform: 'none' }}
                        >
                            Sign Up
                        </Button>
                    </Box>
                )}
            </Toolbar>
        </AppBar>
    );
};

export default NavBar;
