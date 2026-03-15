
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { addToCart } from '../store/slices/cartSlice';
import toast from 'react-hot-toast';
import useCurrency from '../hooks/useCurrency';

export default function ProductDetailsModal({ product, isOpen, onClose }) {
    const dispatch = useDispatch();
    const { formatCurrency } = useCurrency();

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleEsc);
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !product) return null;

    const handleAddToCart = () => {
        dispatch(addToCart({
            menu_id: product.id,
            name_ar: product.name_ar,
            price: parseFloat(product.price),
        }));
        toast.success(`تمت إضافة ${product.name_ar} للسلة`);
    };

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const imageUrl = product.image_url
        ? (product.image_url.startsWith('/') ? `${API_URL}${product.image_url}` : product.image_url)
        : null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose} aria-label="Close">
                    &times;
                </button>


                <div className="modal-image-container">
                    {imageUrl ? (
                        <img src={imageUrl} alt={product.name_ar} className="modal-image" />
                    ) : (
                        <div className="modal-image-placeholder">
                            🍽️
                        </div>
                    )}
                </div>

                <div className="modal-details">
                    <div className="modal-header">
                        <span className="modal-category-badge">
                            {product.Category?.name_ar || 'عام'}
                        </span>
                        {product.is_available === false && (
                            <span className="modal-stock-badge out-of-stock">غير متوفر</span>
                        )}
                    </div>

                    <h2 className="modal-title">{product.name_ar}</h2>

                    <div className="modal-price">
                        {formatCurrency(parseFloat(product.price))}
                    </div>

                    <p className="modal-description">
                        {product.description_ar || 'لا يوجد وصف متاح لهذا المنتج.'}
                    </p>

                    <div className="modal-actions">
                        <button
                            className="btn btn-primary btn-full btn-lg modal-add-btn"
                            onClick={handleAddToCart}
                            disabled={product.is_available === false}
                        >
                            {product.is_available === false ? 'نفذت الكمية' : 'إضافة إلى السلة 🛒'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
