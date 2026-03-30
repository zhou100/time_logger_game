import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AppBar, Toolbar, IconButton, Menu, MenuItem, Typography, Box, Avatar, Button } from '@mui/material';
import { AccountCircle } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { palette } from '../theme';
import Logger from '../utils/logger';

const NavBar: React.FC = () => {
    const navigate = useNavigate();
    const { user, logout, loginWithGoogle, useSupabase } = useAuth();
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

    const handleGoogleSignIn = async () => {
        try {
            await loginWithGoogle();
        } catch (error) {
            Logger.error('Google sign-in error:', error);
        }
    };

    return (
        <AppBar position="static" elevation={0} sx={{ bgcolor: palette.bg }}>
            <Toolbar>
                <Typography
                    variant="h3"
                    component={RouterLink}
                    to="/"
                    sx={{ flexGrow: 1, color: 'text.primary', textDecoration: 'none' }}
                >
                    Time Logger
                </Typography>
                {user ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography
                            variant="body2"
                            sx={{
                                mr: 2,
                                color: 'text.secondary',
                                display: { xs: 'none', sm: 'block' },
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
                            <Avatar sx={{ width: 32, height: 32, bgcolor: palette.accent }}>
                                <AccountCircle />
                            </Avatar>
                        </IconButton>
                        <Menu
                            id="menu-appbar"
                            anchorEl={anchorEl}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            keepMounted
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            open={Boolean(anchorEl)}
                            onClose={handleClose}
                        >
                            <MenuItem onClick={handleLogout}>Sign Out</MenuItem>
                        </Menu>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {useSupabase && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleGoogleSignIn}
                            >
                                Sign in with Google
                            </Button>
                        )}
                        <Button
                            component={RouterLink}
                            to="/login"
                            variant="text"
                            size="small"
                            sx={{ color: 'text.secondary' }}
                        >
                            Sign In
                        </Button>
                        <Button
                            component={RouterLink}
                            to="/register"
                            variant="contained"
                            size="small"
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
