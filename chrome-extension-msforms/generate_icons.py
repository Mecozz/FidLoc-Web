#!/usr/bin/env python3
"""Generate professional icons for FidLoc MS Forms Filler Chrome Extension"""

from PIL import Image, ImageDraw

def create_icon(size, output_path):
    """Create a location pin icon with FidLoc branding"""
    # Create image with transparency
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate dimensions based on size
    padding = size * 0.1
    pin_width = size - (padding * 2)
    pin_height = size - padding
    
    # Colors - FidLoc blue theme
    primary_color = (77, 171, 247)  # #4dabf7
    secondary_color = (34, 139, 230)  # #228be6
    white = (255, 255, 255)
    
    # Draw rounded rectangle background
    corner_radius = size // 5
    draw.rounded_rectangle(
        [padding/2, padding/2, size - padding/2, size - padding/2],
        radius=corner_radius,
        fill=primary_color
    )
    
    # Draw a location pin shape
    center_x = size // 2
    pin_top = size * 0.15
    pin_bottom = size * 0.85
    pin_circle_radius = size * 0.22
    
    # Pin body (teardrop shape using polygon)
    pin_points = [
        (center_x, pin_bottom),  # Bottom point
        (center_x - pin_circle_radius * 1.1, center_x - pin_circle_radius * 0.3),  # Left curve
        (center_x + pin_circle_radius * 1.1, center_x - pin_circle_radius * 0.3),  # Right curve
    ]
    
    # Draw the pin circle (top part)
    circle_center_y = size * 0.38
    draw.ellipse(
        [center_x - pin_circle_radius, circle_center_y - pin_circle_radius,
         center_x + pin_circle_radius, circle_center_y + pin_circle_radius],
        fill=white
    )
    
    # Draw the pin point (triangle)
    point_top = circle_center_y + pin_circle_radius * 0.5
    draw.polygon([
        (center_x - pin_circle_radius * 0.7, point_top),
        (center_x + pin_circle_radius * 0.7, point_top),
        (center_x, pin_bottom - size * 0.1)
    ], fill=white)
    
    # Draw inner circle (hole in pin)
    inner_radius = pin_circle_radius * 0.45
    draw.ellipse(
        [center_x - inner_radius, circle_center_y - inner_radius,
         center_x + inner_radius, circle_center_y + inner_radius],
        fill=primary_color
    )
    
    # Save
    img.save(output_path, 'PNG')
    print(f"Created {output_path}")

# Generate all required sizes
icon_dir = "/Users/darren/Desktop/fidloc-web/chrome-extension-msforms/icons"
create_icon(16, f"{icon_dir}/icon16.png")
create_icon(48, f"{icon_dir}/icon48.png")
create_icon(128, f"{icon_dir}/icon128.png")

# Also create store assets
store_dir = "/Users/darren/Desktop/fidloc-web/chrome-extension-msforms/store-assets"
create_icon(128, f"{store_dir}/icon128.png")

print("All icons generated!")
