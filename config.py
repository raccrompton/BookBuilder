import yaml
import os
import addict
import logging

# You can store your '/config.yaml' location here if you are running this with python and don't want to reinput it everytime
# eg change 'None' to something like 'C:\Dropbox\Chess\BookBuilder-main\config.yaml'
yaml_location = None

if yaml_location is None:
    yaml_location = input('What is the full path to your config.yaml file? (ie. /Users/youruser/BookBuilder/config.yaml): ')
while not os.path.exists(yaml_location):
        yaml_location = input('The location you have input does not exist, please try again: ')

print("Loading config file...")
with open(yaml_location, "r") as f:
    yaml_config = yaml.safe_load(f)
    
# Convert to addict.Dict but ensure nested values are primitives  
def ensure_primitive_values(obj):
    """Recursively convert addict.Dict nested objects to primitive values where appropriate"""
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if isinstance(value, dict) and len(value) == 0:
                result[key] = 0  # Empty dict becomes 0
            elif isinstance(value, dict):
                result[key] = ensure_primitive_values(value)
            elif isinstance(value, list):
                result[key] = [ensure_primitive_values(item) if isinstance(item, dict) else item for item in value]
            else:
                result[key] = value
        return result
    return obj

yaml_config = ensure_primitive_values(yaml_config)
config = addict.Dict(yaml_config)

print(f"File loaded!")

if config.CAREABOUTENGINE==1:
    if not os.path.exists(config.ENGINEPATH):
        logging.error(f"The path ({config.ENGINEPATH}) you have provided for ENGINEPATH in the config file does not exist. Please fix that and run the program again.")