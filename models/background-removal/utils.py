import cv2
import numpy as np
import requests
from PIL import Image
from io import BytesIO
import torch
from pathlib import Path
import torch.nn.functional as F
from typing import Dict, Any, List, Union, Tuple
from torchvision.transforms.functional import normalize

INPUT_SIZE = [1200, 1800]

def keep_large_components(a: np.ndarray) -> np.ndarray:
    """Remove small connected components from a binary mask, keeping only large regions.
    
    Args:
        a: Input binary mask as numpy array of shape (H,W) or (H,W,1)
        
    Returns:
        Processed mask with only large connected components remaining, shape (H,W,1)
    """
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9, 9))
    a_mask = (a > 25).astype(np.uint8) * 255

    # Apply the Component analysis function
    analysis = cv2.connectedComponentsWithStats(a_mask, 4, cv2.CV_32S)
    (totalLabels, label_ids, values, centroid) = analysis

    # Find the components to be kept
    h, w = a.shape[:2]
    area_limit = 50000 * (h * w) / (INPUT_SIZE[1] * INPUT_SIZE[0])
    i_to_keep = []
    for i in range(1, totalLabels):
        area = values[i, cv2.CC_STAT_AREA]
        if area > area_limit:
            i_to_keep.append(i)

    if len(i_to_keep) > 0:
        # Or masks to be kept
        final_mask = np.zeros_like(a, dtype=np.uint8)
        for i in i_to_keep:
            componentMask = (label_ids == i).astype("uint8") * 255
            final_mask = cv2.bitwise_or(final_mask, componentMask)

        # Remove other components
        # Keep edges
        final_mask = cv2.dilate(final_mask, dilate_kernel, iterations = 2)
        a = cv2.bitwise_and(a, final_mask)
        a = a.reshape((a.shape[0], a.shape[1], 1))
        
    return a

def read_img(img: Union[str, Path]) -> np.ndarray:
    """Read an image from a URL or local path.
    
    Args:
        img: URL or file path to image
        
    Returns:
        Image as numpy array in RGB format with shape (H,W,3)
    """
    if img[0: 4] == 'http':
        response = requests.get(img)
        im = np.asarray(Image.open(BytesIO(response.content)))
        
    else:
        im = cv2.imread(str(img))
        im = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)

    return im

def preprocess_input(im: np.ndarray) -> torch.Tensor:
    """Preprocess image for model input.
    
    Args:
        im: Input image as numpy array of shape (H,W,C)
        
    Returns:
        Preprocessed image as normalized torch tensor of shape (1,3,H,W)
    """
    if len(im.shape) < 3:
        im = im[:, :, np.newaxis]
        
    if im.shape[2] == 4:  # if image has alpha channel, remove it
        im = im[:,:,:3]

    im_tensor = torch.tensor(im, dtype=torch.float32).permute(2,0,1)
    im_tensor = F.upsample(torch.unsqueeze(im_tensor,0), INPUT_SIZE, mode="bilinear").type(torch.uint8)
    image = torch.divide(im_tensor,255.0)
    image = normalize(image,[0.5,0.5,0.5],[1.0,1.0,1.0])

    if torch.cuda.is_available():
        image=image.cuda()
    
    return image

def postprocess_output(result: np.ndarray, orig_im_shape: Tuple[int, int]) -> np.ndarray:
    """Postprocess ONNX model output.
    
    Args:
        result: Model output as numpy array of shape (1,1,H,W)
        orig_im_shape: Original image dimensions (height, width)
        
    Returns:
        Processed binary mask as numpy array of shape (H,W,1)
    """
    result = torch.squeeze(F.upsample(
        torch.from_numpy(result).unsqueeze(0), (orig_im_shape), mode='bilinear'), 0)
    ma = torch.max(result)
    mi = torch.min(result)
    result = (result-mi)/(ma-mi)

    # a is alpha channel. 255 means foreground, 0 means background.
    a = (result*255).permute(1,2,0).cpu().data.numpy().astype(np.uint8)
    
    # postprocessing
    a = keep_large_components(a)

    return a

def process_image(src: Union[str, Path], ort_session: Any, model_path: Union[str, Path], outname: str) -> None:
    """Process an image through ONNX model to generate alpha mask and save result.
    
    Args:
        src: Source image URL or path
        ort_session: ONNX runtime inference session
        model_path: Path to ONNX model file 
        outname: Output filename for saving result
        
    Returns:
        None
    """
    # Load and preprocess image
    image_orig = read_img(src)
    image = preprocess_input(image_orig)
    
    # Prepare ONNX input
    inputs: Dict[str, Any] = {ort_session.get_inputs()[0].name: image.numpy()}
    
    # Get ONNX output and post-process
    result = ort_session.run(None, inputs)[0][0]
    alpha = postprocess_output(result, (image_orig.shape[0], image_orig.shape[1]))
    
    # Combine RGB image with alpha mask and save
    img_w_alpha = np.dstack((cv2.cvtColor(image_orig, cv2.COLOR_BGR2RGB), alpha))
    cv2.imwrite(outname, img_w_alpha)
    print(f"Saved: {outname}")